import { Router } from "express";
import type { Services } from "../types/bot.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createBabyRouter } from "./routes/baby.routes.js";
import { createEntriesRouter } from "./routes/entries.routes.js";
import { createMediaRouter } from "./routes/media.routes.js";
import { createSummaryRouter } from "./routes/summary.routes.js";
import { createUploadRouter } from "./routes/upload.routes.js";
import { apiErrorHandler } from "./middleware/errorHandler.js";
import type { S3Service } from "../services/s3.service.js";
import type { ThumbnailService } from "../services/thumbnail.service.js";

type GetFileUrl = (fileId: string) => Promise<string>;
type GetTelegramPhotoData = (fileId: string) => Promise<{ data: Buffer; mimeType: string }>;
type ApiServices = Services & {
  s3Service: S3Service | null;
  thumbnailService: ThumbnailService;
};

export function createApiRouter(
  services: ApiServices,
  botToken: string,
  getFileUrl: GetFileUrl,
  getTelegramPhotoData: GetTelegramPhotoData,
): Router {
  const router = Router();

  // Media proxy before auth — <img src> can't send Authorization header.
  // Telegram fileId is opaque and unguessable, so it serves as an access token.
  router.use("/media", createMediaRouter(getFileUrl, services.s3Service));

  router.use(createAuthMiddleware(services.userService, botToken));

  router.use(
    "/upload",
    createUploadRouter(services.s3Service, services.thumbnailService),
  );
  router.use(
    "/baby",
    createBabyRouter(services.babyService, services.inviteService),
  );
  router.use(
    "/entries",
    createEntriesRouter(services.diaryService, services.taggingService),
  );
  router.use(
    "/summary",
    createSummaryRouter(
      services.babyService,
      services.diaryService,
      services.summaryService,
      getTelegramPhotoData,
      services.s3Service,
    ),
  );

  router.use(apiErrorHandler);

  return router;
}
