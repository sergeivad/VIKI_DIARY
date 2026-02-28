import { Router } from "express";
import type { Services } from "../types/bot.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createBabyRouter } from "./routes/baby.routes.js";
import { createEntriesRouter } from "./routes/entries.routes.js";
import { createMediaRouter } from "./routes/media.routes.js";
import { createSummaryRouter } from "./routes/summary.routes.js";
import { apiErrorHandler } from "./middleware/errorHandler.js";

type GetFileUrl = (fileId: string) => Promise<string>;

export function createApiRouter(
  services: Services,
  botToken: string,
  getFileUrl: GetFileUrl,
): Router {
  const router = Router();

  // Media proxy before auth — <img src> can't send Authorization header.
  // Telegram fileId is opaque and unguessable, so it serves as an access token.
  router.use("/media", createMediaRouter(getFileUrl));

  router.use(createAuthMiddleware(services.userService, botToken));

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
    ),
  );

  router.use(apiErrorHandler);

  return router;
}
