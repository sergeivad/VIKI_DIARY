import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { BabyService } from "../../services/baby.service.js";
import type { DiaryService } from "../../services/diary.service.js";
import type { S3Service } from "../../services/s3.service.js";
import type { SummaryPhotoInput, SummaryService } from "../../services/summary.service.js";
import type { AuthedRequest } from "../types.js";
import { getMonthDateRange } from "../../utils/month.js";

type GetTelegramPhotoData = (fileId: string) => Promise<{ data: Buffer; mimeType: string }>;

function getPhotoKey(item: { fileId: string | null; s3Key: string | null }): string | null {
  if (item.fileId) {
    return `file:${item.fileId}`;
  }

  if (item.s3Key) {
    return `s3:${item.s3Key}`;
  }

  return null;
}

function getItemS3Key(item: unknown): string | null {
  const value = (item as { s3Key?: unknown }).s3Key;
  return typeof value === "string" ? value : null;
}

export function createSummaryRouter(
  babyService: BabyService,
  diaryService: DiaryService,
  summaryService: SummaryService,
  getTelegramPhotoData: GetTelegramPhotoData,
  s3Service: S3Service | null,
): Router {
  const router = Router();

  router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const month = Number(req.query.month);
      const year = Number(req.query.year);

      if (!month || !year) {
        res.status(400).json({ error: "month and year query params are required" });
        return;
      }

      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "Baby not found" });
        return;
      }

      const summary = await summaryService.getSummary(baby.id, month, year);
      if (!summary) {
        res.status(404).json({ error: "Summary not found" });
        return;
      }

      res.json({
        summary: summary.text,
        totalEntries: 0,
        month: summary.month,
        year: summary.year,
        createdAt: summary.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { month, year } = req.body;

      if (month == null || year == null) {
        res.status(400).json({ error: "month and year are required" });
        return;
      }

      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "Baby not found" });
        return;
      }

      const { dateFrom, dateTo } = getMonthDateRange(year, month);

      const entries = await diaryService.getEntriesForDateRange({
        babyId: baby.id,
        actorId: actor.userId,
        dateFrom,
        dateTo,
      });

      const uniquePhotos = new Map<string, { fileId: string | null; s3Key: string | null }>();
      entries.forEach((entry) => {
        for (const item of entry.items) {
          if (item.type !== "photo") {
            continue;
          }

          const key = getPhotoKey({ fileId: item.fileId, s3Key: getItemS3Key(item) });
          if (!key) {
            continue;
          }

          uniquePhotos.set(key, { fileId: item.fileId, s3Key: getItemS3Key(item) });
        }
      });

      const photoInputs = (await Promise.all(
        [...uniquePhotos.entries()].map(async ([key, source]): Promise<SummaryPhotoInput | null> => {
          try {
            if (source.fileId) {
              const telegramPhoto = await getTelegramPhotoData(source.fileId);
              return {
                key,
                mimeType: telegramPhoto.mimeType,
                data: telegramPhoto.data,
              };
            }

            if (source.s3Key && s3Service) {
              const s3Photo = await s3Service.getObjectData(source.s3Key);
              return {
                key,
                mimeType: s3Photo.mimeType ?? "image/jpeg",
                data: s3Photo.data,
              };
            }

            return null;
          } catch {
            return null;
          }
        }),
      )).filter((item): item is SummaryPhotoInput => item !== null);

      const photoDescriptions = photoInputs.length > 0
        ? await summaryService.describePhotos(photoInputs)
        : new Map<string, string>();

      // Build enriched entries text
      const entriesText = entries.map((entry) => {
        const date = entry.eventDate.toISOString().slice(0, 10);
        const textContent = entry.items
          .map((item) => item.textContent)
          .filter(Boolean)
          .join(" ");

        const photoDescs = entry.items
          .filter((item) => item.type === "photo")
          .map((item) => {
            const key = getPhotoKey({ fileId: item.fileId, s3Key: getItemS3Key(item) });
            if (!key) {
              return null;
            }

            const description = photoDescriptions.get(key);
            return description ? `[Фото: ${description}]` : null;
          })
          .filter((item): item is string => item !== null);

        const parts = [
          `[${date}] ${entry.author.firstName}: ${textContent}`,
        ];
        if (photoDescs.length > 0) {
          parts.push(photoDescs.join(" "));
        }
        return parts.join(" ");
      });

      const text = await summaryService.generateSummary({
        babyName: baby.name,
        birthDate: baby.birthDate,
        month,
        year,
        entriesText,
      });

      const saved = await summaryService.saveSummary(baby.id, month, year, text);

      res.json({
        summary: saved.text,
        totalEntries: entries.length,
        month: saved.month,
        year: saved.year,
        createdAt: saved.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
