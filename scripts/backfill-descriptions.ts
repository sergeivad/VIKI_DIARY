import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { SummaryService } from "../src/services/summary.service.js";
import { downloadTelegramFileWithMeta } from "../src/utils/telegram.js";
import { S3Service } from "../src/services/s3.service.js";
import { Bot } from "grammy";
import pino from "pino";

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

async function main(): Promise<void> {
  const log = pino({ level: "info" });

  const botToken = process.env.BOT_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!botToken || !openaiKey) {
    console.error("BOT_TOKEN and OPENAI_API_KEY env vars are required");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const openai = new OpenAI({ apiKey: openaiKey });
  const summaryService = new SummaryService(prisma, openai, log);
  const bot = new Bot(botToken);

  const s3Service =
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? new S3Service({
          endpoint: process.env.S3_ENDPOINT,
          bucket: process.env.S3_BUCKET,
          accessKey: process.env.S3_ACCESS_KEY,
          secretKey: process.env.S3_SECRET_KEY,
          region: process.env.S3_REGION ?? "",
        })
      : null;

  try {
    const photos = await prisma.entryItem.findMany({
      where: { type: "photo", description: null },
      select: { id: true, fileId: true, s3Key: true },
      orderBy: { createdAt: "asc" },
    });

    const total = photos.length;
    console.log(`Found ${total} photos without descriptions`);

    if (total === 0) {
      return;
    }

    let described = 0;
    let skipped = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = photos.slice(i, i + BATCH_SIZE);

      for (const photo of batch) {
        try {
          let data: Buffer;
          let mimeType: string;

          if (photo.fileId) {
            const file = await downloadTelegramFileWithMeta(bot.api, botToken, photo.fileId);
            data = file.data;
            mimeType = file.mimeType;
          } else if (photo.s3Key && s3Service) {
            const s3Photo = await s3Service.getObjectData(photo.s3Key);
            data = s3Photo.data;
            mimeType = s3Photo.mimeType ?? "image/jpeg";
          } else {
            skipped++;
            continue;
          }

          const description = await summaryService.describePhoto({ mimeType, data });

          if (description) {
            await prisma.entryItem.update({
              where: { id: photo.id },
              data: { description },
            });
            described++;
          } else {
            skipped++;
          }

          console.log(`[${described + skipped}/${total}] ${description ? "Described" : "Skipped"} ${photo.id}`);
        } catch (error) {
          skipped++;
          console.error(`[${described + skipped}/${total}] Failed ${photo.id}:`, error instanceof Error ? error.message : error);
        }
      }

      if (i + BATCH_SIZE < total) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`\nDone: ${described} described, ${skipped} skipped out of ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
