import { Router } from "express";
import type { NextFunction, Response } from "express";
import multer from "multer";
import { S3DomainError, S3ErrorCode } from "../../services/s3.errors.js";
import type { S3Service } from "../../services/s3.service.js";
import type { ThumbnailService } from "../../services/thumbnail.service.js";
import type { AuthedRequest } from "../types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export function createUploadRouter(
  s3Service: S3Service | null,
  thumbnailService: ThumbnailService,
): Router {
  const router = Router();

  router.post(
    "/",
    upload.single("file"),
    async (req, res: Response, next: NextFunction) => {
      try {
        if (!s3Service) {
          throw new S3DomainError(S3ErrorCode.s3NotConfigured, "S3 storage is not configured");
        }

        const { actor } = req as unknown as AuthedRequest;
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "file is required" });
          return;
        }

        s3Service.validateFile(file.mimetype, file.size);

        const prefix = `uploads/${actor.userId}`;
        const result = await s3Service.upload(file.buffer, file.mimetype, prefix);

        let thumbnailS3Key: string | null = null;
        if (s3Service.isVideo(file.mimetype)) {
          const thumbBuffer = await thumbnailService.extractVideoThumbnail(file.buffer);
          if (thumbBuffer) {
            const thumbResult = await s3Service.upload(
              thumbBuffer,
              "image/jpeg",
              `${prefix}/thumbs`,
            );
            thumbnailS3Key = thumbResult.s3Key;
          }
        }

        res.status(201).json({
          s3Key: result.s3Key,
          thumbnailS3Key,
          mimeType: result.mimeType,
          size: result.size,
          type: s3Service.isVideo(file.mimetype) ? "video" : "photo",
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.use((err: unknown, _req: unknown, _res: unknown, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new S3DomainError(S3ErrorCode.fileTooLarge, "File too large: max 50MB"));
      return;
    }

    next(err);
  });

  return router;
}
