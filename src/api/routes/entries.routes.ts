import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { DiaryService } from "../../services/diary.service.js";
import type { TaggingService } from "../../services/tagging.service.js";
import type { AuthedRequest } from "../types.js";
import { logger } from "../../config/logger.js";

export function createEntriesRouter(
  diaryService: DiaryService,
  taggingService: TaggingService,
): Router {
  const router = Router();

  // GET / — paginated history
  router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const babyId = req.query.babyId as string | undefined;

      if (!babyId) {
        res.status(400).json({ error: "babyId is required" });
        return;
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

      const result = await diaryService.getHistory({
        babyId,
        actorId: actor.userId,
        page,
        limit,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — single entry
  router.get("/:id", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as unknown as AuthedRequest;
      const entry = await diaryService.getEntryById({
        entryId: req.params.id,
        actorId: actor.userId,
      });

      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // POST / — create text entry
  router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { babyId, text, eventDate } = req.body as {
        babyId?: string;
        text?: string;
        eventDate?: string;
      };

      if (!babyId || !text) {
        res.status(400).json({ error: "babyId and text are required" });
        return;
      }

      const entry = await diaryService.createEntry({
        babyId,
        authorId: actor.userId,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        items: [{ type: "text", textContent: text }],
      });

      // Fire-and-forget tagging
      taggingService
        .generateTags(text)
        .then((tags) => diaryService.updateTags(entry.id, tags))
        .catch((err) => logger.error({ err }, "Fire-and-forget tagging failed"));

      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/text — update entry text
  router.patch("/:id/text", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as unknown as AuthedRequest;
      const { text } = req.body as { text?: string };

      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      const entry = await diaryService.updateEntryText({
        entryId: req.params.id,
        actorId: actor.userId,
        newText: text,
      });

      // Fire-and-forget re-tagging
      taggingService
        .generateTags(text)
        .then((tags) => diaryService.updateTags(entry.id, tags))
        .catch((err) => logger.error({ err }, "Fire-and-forget re-tagging failed"));

      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/date — update event date
  router.patch("/:id/date", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as unknown as AuthedRequest;
      const { eventDate } = req.body as { eventDate?: string };

      if (!eventDate) {
        res.status(400).json({ error: "eventDate is required" });
        return;
      }

      const entry = await diaryService.updateEventDate({
        entryId: req.params.id,
        actorId: actor.userId,
        eventDate: new Date(eventDate),
      });

      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — delete entry
  router.delete("/:id", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as unknown as AuthedRequest;
      await diaryService.deleteEntry({
        entryId: req.params.id,
        actorId: actor.userId,
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
