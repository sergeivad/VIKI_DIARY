import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import { createUploadRouter } from "../../../src/api/routes/upload.routes.js";
import { apiErrorHandler } from "../../../src/api/middleware/errorHandler.js";

const ACTOR = { telegramId: BigInt(12345), userId: "user-1" };

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).actor = ACTOR;
  next();
}

describe("upload routes", () => {
  const s3Service = {
    validateFile: vi.fn(),
    upload: vi.fn(),
    isVideo: vi.fn(),
  };

  const thumbnailService = {
    extractVideoThumbnail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    s3Service.upload.mockResolvedValue({
      s3Key: "uploads/user-1/file.jpg",
      mimeType: "image/jpeg",
      size: 9,
    });
    s3Service.isVideo.mockReturnValue(false);
    thumbnailService.extractVideoThumbnail.mockResolvedValue(null);
  });

  function buildApp(withS3 = true) {
    const app = express();
    app.use(fakeAuth);
    app.use(
      "/upload",
      createUploadRouter(withS3 ? (s3Service as any) : null, thumbnailService as any),
    );
    app.use(apiErrorHandler);
    return app;
  }

  it("returns 400 when file is missing", async () => {
    const app = buildApp();
    const res = await request(app).post("/upload");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "file is required" });
  });

  it("uploads image and returns metadata", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("image-data"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      s3Key: "uploads/user-1/file.jpg",
      thumbnailS3Key: null,
      mimeType: "image/jpeg",
      size: 9,
      type: "photo",
    });

    expect(s3Service.validateFile).toHaveBeenCalledWith("image/jpeg", 10);
    expect(s3Service.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/jpeg",
      "uploads/user-1",
    );
  });

  it("returns 503 when S3 is not configured", async () => {
    const app = buildApp(false);
    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("image-data"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("S3_NOT_CONFIGURED");
  });
});
