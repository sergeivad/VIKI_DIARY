import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { webhookCallback } from "grammy";
import OpenAI from "openai";

import { createApiRouter } from "./api/router.js";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./db/prisma.js";
import { BabyService } from "./services/baby.service.js";
import { DiaryService } from "./services/diary.service.js";
import { InviteService } from "./services/invite.service.js";
import { NotificationService } from "./services/notification.service.js";
import { SummaryService } from "./services/summary.service.js";
import { TaggingService } from "./services/tagging.service.js";
import { TranscriptionService } from "./services/transcription.service.js";
import { UserService } from "./services/user.service.js";

const app = express();

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const userService = new UserService(prisma);
const babyService = new BabyService(prisma);
const inviteService = new InviteService(prisma, env.BOT_USERNAME);
const diaryService = new DiaryService(prisma);
const transcriptionService = new TranscriptionService(openai);
const taggingService = new TaggingService(openai, logger);
const summaryService = new SummaryService(openai, logger);

let bot!: ReturnType<typeof createBot>;

const services = {
  userService,
  babyService,
  inviteService,
  diaryService,
  transcriptionService,
  taggingService,
  summaryService,
  notificationService: new NotificationService(
    babyService,
    async (telegramId, text) => {
      await bot.api.sendMessage(telegramId.toString(), text);
    }
  )
};

bot = createBot(services);

const getFileUrl = async (fileId: string): Promise<string> => {
  const file = await bot.api.getFile(fileId);
  return `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
};

const apiRouter = createApiRouter(services, env.BOT_TOKEN, getFileUrl);

app.get("/health/live", (_req, res) => {
  res.status(200).json({ ok: true, status: "live" });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true, status: "ready" });
  } catch (error) {
    logger.error({ err: error }, "Readiness check failed");
    res.status(503).json({ ok: false, status: "not_ready" });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, status: "live" });
});

// REST API
app.use("/api/v1", express.json(), apiRouter);

// Mini App static files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const miniappDist = path.join(__dirname, "..", "miniapp", "dist");
app.use("/app", express.static(miniappDist));
app.get("/app/*", (_req, res) => {
  res.sendFile(path.join(miniappDist, "index.html"));
});

app.use(
  env.WEBHOOK_PATH,
  express.json(),
  webhookCallback(bot, "express", "return", 15_000, env.WEBHOOK_SECRET)
);

const server = app.listen(env.PORT, async () => {
  logger.info({ port: env.PORT, webhookPath: env.WEBHOOK_PATH }, "Server started");
  try {
    await prisma.$connect();
    logger.info("Database connected");
  } catch (error) {
    logger.error({ err: error }, "Failed to connect to database");
  }
  try {
    await bot.api.setWebhook(env.WEBHOOK_URL, {
      secret_token: env.WEBHOOK_SECRET,
      drop_pending_updates: false
    });
    logger.info({ webhookUrl: env.WEBHOOK_URL }, "Webhook is set");
  } catch (error) {
    logger.error({ err: error }, "Failed to set webhook");
  }
});

const shutdown = async (): Promise<void> => {
  logger.info("Shutdown signal received");
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
