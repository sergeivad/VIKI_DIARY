import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { DiaryItemInput, DiaryService } from "../../services/diary.service.js";
import type { TaggingService } from "../../services/tagging.service.js";
import type { AuthedRequest } from "../types.js";
import { logger } from "../../config/logger.js";

type SupportedMediaType = "photo" | "video";

function isSupportedMediaType(type: unknown): type is SupportedMediaType {
  return type === "photo" || type === "video";
}

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

  // POST / — create entry
  router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { babyId, text, eventDate, media } = req.body as {
        babyId?: string;
        text?: string;
        eventDate?: string;
        media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: string }>;
      };

      if (!babyId) {
        res.status(400).json({ error: "babyId is required" });
        return;
      }

      if (!text && (!media || media.length === 0)) {
        res.status(400).json({ error: "text or media is required" });
        return;
      }

      const items: DiaryItemInput[] = [];
      if (text) {
        items.push({ type: "text", textContent: text });
      }
      if (media) {
        for (const item of media) {
          if (!isSupportedMediaType(item.type)) {
            res.status(400).json({ error: "unsupported media type" });
            return;
          }

          items.push({
            type: item.type,
            s3Key: item.s3Key,
            thumbnailS3Key: item.thumbnailS3Key ?? null,
          });
        }
      }

      const entry = await diaryService.createEntry({
        babyId,
        authorId: actor.userId,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        items,
      });

      if (text) {
        taggingService
          .generateTags(text)
          .then((tags) => diaryService.updateTags(entry.id, tags))
          .catch((err) => logger.error({ err }, "Fire-and-forget tagging failed"));
      }

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

  // POST /:id/media — add media items to existing entry
  router.post("/:id/media", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as unknown as AuthedRequest;
      const { media } = req.body as {
        media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: string }>;
      };

      if (!media || media.length === 0) {
        res.status(400).json({ error: "media array is required" });
        return;
      }

      for (const item of media) {
        if (!isSupportedMediaType(item.type)) {
          res.status(400).json({ error: "unsupported media type" });
          return;
        }
      }

      const mediaItems: DiaryItemInput[] = media.map((item) => ({
        type: item.type as SupportedMediaType,
        s3Key: item.s3Key,
        thumbnailS3Key: item.thumbnailS3Key ?? null,
      }));

      const entry = await diaryService.addItemsToEntry({
        entryId: req.params.id,
        actorId: actor.userId,
        items: mediaItems,
      });

      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
