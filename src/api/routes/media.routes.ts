import { Router } from "express";
import type { Response as ExpressResponse, NextFunction } from "express";
import { logger } from "../../config/logger.js";
import type { S3Service } from "../../services/s3.service.js";

type GetFileUrl = (fileId: string) => Promise<string>;

const TELEGRAM_FETCH_TIMEOUT_MS = 10_000;
const TELEGRAM_FETCH_MAX_ATTEMPTS = 3;
const TELEGRAM_FETCH_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.message.toLowerCase().includes("fetch failed");
}

async function fetchTelegramWithRetry(url: string): Promise<globalThis.Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TELEGRAM_FETCH_TIMEOUT_MS);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === TELEGRAM_FETCH_MAX_ATTEMPTS) {
        break;
      }
      await delay(TELEGRAM_FETCH_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch telegram file");
}

export function createMediaRouter(
  getFileUrl: GetFileUrl,
  s3Service: S3Service | null = null,
): Router {
  const router = Router();

  router.get("/:fileId", async (req, res: ExpressResponse, next: NextFunction) => {
    try {
      const source = req.query.source as string | undefined;
      const id = req.params.fileId.trim();

      if (!id) {
        res.status(400).json({ error: "fileId is required" });
        return;
      }

      if (source === "s3" && s3Service) {
        const presignedUrl = await s3Service.getPresignedUrl(id);
        res.redirect(302, presignedUrl);
        return;
      }

      const url = await getFileUrl(id);
      let upstream: globalThis.Response;
      try {
        upstream = await fetchTelegramWithRetry(url);
      } catch (error) {
        logger.error({ err: error, fileId: id }, "Media proxy fetch failed after retries");
        res.status(502).json({ error: "Failed to fetch file from Telegram" });
        return;
      }

      if (!upstream.ok) {
        res.status(502).json({ error: "Failed to fetch file from Telegram" });
        return;
      }

      const contentType =
        upstream.headers.get("content-type") ?? "application/octet-stream";

      // Buffer the response to support Content-Length and Range requests
      // (required by Safari/iOS WebView for video playback).
      // Bot API files are max 20MB, so buffering is acceptable.
      const buffer = Buffer.from(await upstream.arrayBuffer());
      const total = buffer.length;

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Accept-Ranges", "bytes");

      const range = req.headers.range;
      if (range) {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : total - 1;

          if (start >= total || end >= total || start > end) {
            res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
            return;
          }

          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          res.setHeader("Content-Length", end - start + 1);
          res.end(buffer.subarray(start, end + 1));
          return;
        }
      }

      res.setHeader("Content-Length", total);
      res.end(buffer);
    } catch (err) {
      logger.error({ err, fileId: req.params.fileId }, "Media proxy error");
      next(err);
    }
  });

  return router;
}
