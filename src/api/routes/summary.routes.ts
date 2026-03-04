import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { BabyService } from "../../services/baby.service.js";
import type { DiaryService } from "../../services/diary.service.js";
import type { SummaryService } from "../../services/summary.service.js";
import type { AuthedRequest } from "../types.js";
import { getMonthDateRange } from "../../utils/month.js";

export function createSummaryRouter(
  babyService: BabyService,
  diaryService: DiaryService,
  summaryService: SummaryService,
  getFileUrl: (fileId: string) => Promise<string>,
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

      // Collect photo fileIds from entries
      const photoFileIds: { fileId: string }[] = [];
      entries.forEach((entry) => {
        for (const item of entry.items) {
          if (item.type === "photo" && item.fileId) {
            photoFileIds.push({ fileId: item.fileId });
          }
        }
      });

      // Get photo URLs and describe them
      const photoDescriptions = new Map<string, string>();
      if (photoFileIds.length > 0) {
        const urlMap = new Map<string, string>(); // fileId -> url
        await Promise.all(
          photoFileIds.map(async ({ fileId }) => {
            try {
              const url = await getFileUrl(fileId);
              urlMap.set(fileId, url);
            } catch {
              // skip photos we can't fetch
            }
          }),
        );

        const validUrls = [...urlMap.values()];
        if (validUrls.length > 0) {
          const descriptions =
            await summaryService.describePhotos(validUrls);

          // Map back from URL to fileId for entry enrichment
          for (const [fileId, url] of urlMap) {
            const desc = descriptions.get(url);
            if (desc) {
              photoDescriptions.set(fileId, desc);
            }
          }
        }
      }

      // Build enriched entries text
      const entriesText = entries.map((entry) => {
        const date = entry.eventDate.toISOString().slice(0, 10);
        const textContent = entry.items
          .map((item) => item.textContent)
          .filter(Boolean)
          .join(" ");

        const photoDescs = entry.items
          .filter(
            (item) =>
              item.type === "photo" &&
              item.fileId &&
              photoDescriptions.has(item.fileId),
          )
          .map(
            (item) =>
              `[Фото: ${photoDescriptions.get(item.fileId!)}]`,
          );

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
