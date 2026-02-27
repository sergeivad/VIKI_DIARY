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

function buildApp(getFileUrl: (fileId: string) => Promise<string>) {
  const app = express();
  app.use(fakeAuth);
  app.use("/media", createMediaRouter(getFileUrl));
  app.use(apiErrorHandler);
  return app;
}

describe("media routes", () => {
  let getFileUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getFileUrl = vi.fn();
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

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("image-data"));
        controller.close();
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      body,
    }) as any;

    try {
      const app = buildApp(getFileUrl);
      const res = await request(app).get("/media/some-file-id");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/jpeg");
      expect(res.headers["cache-control"]).toBe("public, max-age=86400");
      expect(res.body.toString()).toBe("image-data");
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
