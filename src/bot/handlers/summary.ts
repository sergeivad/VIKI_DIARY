import type { BotContext } from "../../types/bot.js";
import { getHistoryTextContent } from "../formatters/entry.js";
import { buildSummaryKeyboard } from "../keyboards/summary.js";
import { formatRuMonth } from "../../utils/month.js";
import { getMonthDateRange } from "../../utils/month.js";
import { isSummaryDomainError } from "../../services/summary.errors.js";
import type { SummaryPhotoInput } from "../../services/summary.service.js";
import { env } from "../../config/env.js";
import { downloadTelegramFileWithMeta } from "../../utils/telegram.js";

const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";

function getPhotoKey(item: { fileId: string | null; s3Key: string | null }): string | null {
  if (item.fileId) {
    return `file:${item.fileId}`;
  }

  if (item.s3Key) {
    return `s3:${item.s3Key}`;
  }

  return null;
}

function getItemS3Key(item: unknown): string | null {
  const value = (item as { s3Key?: unknown }).s3Key;
  return typeof value === "string" ? value : null;
}

function resolveTargetMonth(): { year: number; month: number } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;

  // If it's the first 5 days of the month, default to previous month
  if (now.getUTCDate() <= 5) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return { year, month };
}

export async function generateSummaryMessage(
  ctx: BotContext,
  actorId: string,
  babyId: string,
  babyName: string,
  birthDate: Date,
  year: number,
  month: number
): Promise<string> {
  const { dateFrom, dateTo } = getMonthDateRange(year, month);

  const entries = await ctx.services.diaryService.getEntriesForDateRange({
    babyId,
    actorId,
    dateFrom,
    dateTo
  });

  if (entries.length === 0) {
    return `В ${formatRuMonth(year, month)} записей нет.`;
  }

  const uniquePhotos = new Map<string, { fileId: string | null; s3Key: string | null }>();
  entries.forEach((entry) => {
    for (const item of entry.items) {
      if (item.type !== "photo") {
        continue;
      }

      const key = getPhotoKey({ fileId: item.fileId, s3Key: getItemS3Key(item) });
      if (!key) {
        continue;
      }

      uniquePhotos.set(key, { fileId: item.fileId, s3Key: getItemS3Key(item) });
    }
  });

  const photoInputs = (await Promise.all(
    [...uniquePhotos.entries()].map(async ([key, source]): Promise<SummaryPhotoInput | null> => {
      if (source.fileId) {
        try {
          const telegramPhoto = await downloadTelegramFileWithMeta(ctx.api, env.BOT_TOKEN, source.fileId);
          return {
            key,
            mimeType: telegramPhoto.mimeType,
            data: telegramPhoto.data
          };
        } catch {
          return null;
        }
      }

      if (source.s3Key && ctx.services.s3Service) {
        try {
          const s3Photo = await ctx.services.s3Service.getObjectData(source.s3Key);
          return {
            key,
            mimeType: s3Photo.mimeType ?? "image/jpeg",
            data: s3Photo.data
          };
        } catch {
          return null;
        }
      }

      return null;
    })
  )).filter((item): item is SummaryPhotoInput => item !== null);

  const photoDescriptions = photoInputs.length > 0
    ? await ctx.services.summaryService.describePhotos(photoInputs)
    : new Map<string, string>();

  const entriesText = entries.map((entry) => {
    const date = entry.eventDate.toISOString().slice(0, 10);
    const text = getHistoryTextContent(entry.items);

    const photoDescs = entry.items
      .filter((item) => item.type === "photo")
      .map((item) => {
        const key = getPhotoKey({ fileId: item.fileId, s3Key: getItemS3Key(item) });
        if (!key) {
          return null;
        }

        const description = photoDescriptions.get(key);
        return description ? `[Фото: ${description}]` : null;
      })
      .filter((item): item is string => item !== null);

    const parts = [`[${date}] ${text}`];
    if (photoDescs.length > 0) parts.push(photoDescs.join(" "));
    return parts.join(" ");
  });

  const summary = await ctx.services.summaryService.generateSummary({
    babyName,
    birthDate,
    month,
    year,
    entriesText
  });

  const header = `📋 Конспект за ${formatRuMonth(year, month)}`;
  return `${header}\n\n${summary}`;
}

export async function handleSummary(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const baby = await ctx.services.babyService.getBabyByUser(user.id);
  if (!baby) {
    await ctx.reply(NO_DIARY_MESSAGE);
    return;
  }

  const { year, month } = resolveTargetMonth();

  try {
    await ctx.replyWithChatAction("typing");

    const message = await generateSummaryMessage(
      ctx, user.id, baby.id, baby.name, baby.birthDate, year, month
    );

    await ctx.reply(message, {
      reply_markup: buildSummaryKeyboard(year, month)
    });
  } catch (error) {
    if (isSummaryDomainError(error)) {
      await ctx.reply(error.message);
      return;
    }
    throw error;
  }
}
