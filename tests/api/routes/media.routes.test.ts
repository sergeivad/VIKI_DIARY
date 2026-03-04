import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import { createMediaRouter } from "../../../src/api/routes/media.routes.js";
import { apiErrorHandler } from "../../../src/api/middleware/errorHandler.js";

const ACTOR = { telegramId: BigInt(12345), userId: "uuid-1" };

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).actor = ACTOR;
  next();
}

function buildApp(
  getFileUrl: (fileId: string) => Promise<string>,
  s3Service: { getPresignedUrl: (key: string) => Promise<string> } | null = null,
) {
  const app = express();
  app.use(fakeAuth);
  app.use("/media", createMediaRouter(getFileUrl, s3Service as any));
  app.use(apiErrorHandler);
  return app;
}

describe("media routes", () => {
  let getFileUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getFileUrl = vi.fn();
  });

  it("redirects to S3 presigned URL when source=s3", async () => {
    const getPresignedUrl = vi.fn().mockResolvedValue("https://s3.test/object?signature=1");
    const app = buildApp(getFileUrl, { getPresignedUrl });
    const res = await request(app).get("/media/uploads%2Fuser-1%2Fabc.jpg?source=s3");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://s3.test/object?signature=1");
    expect(getPresignedUrl).toHaveBeenCalledWith("uploads/user-1/abc.jpg");
    expect(getFileUrl).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream fetch fails", async () => {
    getFileUrl.mockResolvedValue("https://api.telegram.org/file/bot123/photo.jpg");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as any;

    try {
      const app = buildApp(getFileUrl);
      const res = await request(app).get("/media/some-file-id");

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Failed to fetch file from Telegram");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies upstream response with correct headers", async () => {
    getFileUrl.mockResolvedValue("https://api.telegram.org/file/bot123/photo.jpg");

    const imageData = new TextEncoder().encode("image-data");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: () => Promise.resolve(imageData.buffer),
    }) as any;

    try {
      const app = buildApp(getFileUrl);
      const res = await request(app).get("/media/some-file-id");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/jpeg");
      expect(res.headers["cache-control"]).toBe("public, max-age=86400");
      expect(res.headers["accept-ranges"]).toBe("bytes");
      expect(res.headers["content-length"]).toBe(String(imageData.length));
      expect(res.body.toString()).toBe("image-data");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles Range requests with 206 Partial Content", async () => {
    getFileUrl.mockResolvedValue("https://api.telegram.org/file/bot123/video.mp4");

    const videoData = new TextEncoder().encode("0123456789");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "video/mp4" }),
      arrayBuffer: () => Promise.resolve(videoData.buffer),
    }) as any;

    try {
      const app = buildApp(getFileUrl);
      const res = await request(app)
        .get("/media/some-file-id")
        .set("Range", "bytes=0-4");

      expect(res.status).toBe(206);
      expect(res.headers["content-range"]).toBe("bytes 0-4/10");
      expect(res.headers["content-length"]).toBe("5");
      expect(res.body.toString()).toBe("01234");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("passes errors to error handler", async () => {
    getFileUrl.mockRejectedValue(new Error("Telegram API down"));

    const app = buildApp(getFileUrl);
    const res = await request(app).get("/media/some-file-id");

    expect(res.status).toBe(500);
  });
});
