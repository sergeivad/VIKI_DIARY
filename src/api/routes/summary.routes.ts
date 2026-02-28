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

      const entriesText = entries.map((entry) => {
        const date = entry.eventDate.toISOString().slice(0, 10);
        const textContent = entry.items
          .map((item) => item.textContent)
          .filter(Boolean)
          .join(" ");
        return `[${date}] ${entry.author.firstName}: ${textContent}`;
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
