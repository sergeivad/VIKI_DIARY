import { Router } from "express";
import type { Response, NextFunction } from "express";
import { logger } from "../../config/logger.js";

type GetFileUrl = (fileId: string) => Promise<string>;

export function createMediaRouter(getFileUrl: GetFileUrl): Router {
  const router = Router();

  router.get("/:fileId", async (req, res: Response, next: NextFunction) => {
    try {
      const fileId = req.params.fileId.trim();
      if (!fileId) {
        res.status(400).json({ error: "fileId is required" });
        return;
      }

      const url = await getFileUrl(fileId);
      const upstream = await fetch(url);

      if (!upstream.ok) {
        res.status(502).json({ error: "Failed to fetch file from Telegram" });
        return;
      }

      const contentType =
        upstream.headers.get("content-type") ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");

      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
          return pump();
        };
        await pump();
      } else {
        res.status(502).json({ error: "Empty response from Telegram" });
      }
    } catch (err) {
      logger.error({ err, fileId: req.params.fileId }, "Media proxy error");
      next(err);
    }
  });

  return router;
}
