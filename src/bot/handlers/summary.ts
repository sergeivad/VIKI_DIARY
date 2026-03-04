import type { BotContext } from "../../types/bot.js";
import { getHistoryTextContent } from "../formatters/entry.js";
import { buildSummaryKeyboard } from "../keyboards/summary.js";
import { formatRuMonth } from "../../utils/month.js";
import { getMonthDateRange } from "../../utils/month.js";
import { isSummaryDomainError } from "../../services/summary.errors.js";
import { env } from "../../config/env.js";

const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";

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

  // Collect photo fileIds from entries
  const photoFileIds: { fileId: string }[] = [];
  entries.forEach((entry) => {
    for (const item of entry.items) {
      if (item.type === "photo" && item.fileId) {
        photoFileIds.push({ fileId: item.fileId });
      }
    }
  });

  // Get photo URLs and describe them
  const photoDescriptions = new Map<string, string>();
  if (photoFileIds.length > 0) {
    const urlMap = new Map<string, string>(); // fileId -> url
    await Promise.all(
      photoFileIds.map(async ({ fileId }) => {
        try {
          const file = await ctx.api.getFile(fileId);
          if (!file.file_path) return;
          const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
          urlMap.set(fileId, url);
        } catch {
          // skip photos we can't fetch
        }
      })
    );

    const validUrls = [...urlMap.values()];
    if (validUrls.length > 0) {
      const descriptions = await ctx.services.summaryService.describePhotos(validUrls);

      for (const [fileId, url] of urlMap) {
        const desc = descriptions.get(url);
        if (desc) photoDescriptions.set(fileId, desc);
      }
    }
  }

  const entriesText = entries.map((entry) => {
    const date = entry.eventDate.toISOString().slice(0, 10);
    const text = getHistoryTextContent(entry.items);

    const photoDescs = entry.items
      .filter((item) => item.type === "photo" && item.fileId && photoDescriptions.has(item.fileId))
      .map((item) => `[Фото: ${photoDescriptions.get(item.fileId!)}]`);

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
