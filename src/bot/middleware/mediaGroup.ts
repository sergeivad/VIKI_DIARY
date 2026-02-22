import type { NextFunction } from "grammy";

import type { DiaryItemInput } from "../../services/diary.service.js";
import type { BotContext } from "../../types/bot.js";
import { formatRuDate, formatRuTime } from "../../utils/date.js";

const MEDIA_GROUP_FLUSH_DELAY_MS = 600;
const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";
const UNSUPPORTED_CONTENT_MESSAGE = "Пока я умею сохранять только текст, фото и видео 😊";

type BufferedMediaGroup = {
  ctx: BotContext;
  items: DiaryItemInput[];
};

function getPhotoFileId(message: NonNullable<BotContext["message"]>): string | null {
  if (!("photo" in message) || !Array.isArray(message.photo) || message.photo.length === 0) {
    return null;
  }

  const largestPhoto = message.photo[message.photo.length - 1];
  return largestPhoto?.file_id ?? null;
}

function extractItem(message: NonNullable<BotContext["message"]>): DiaryItemInput | null {
  const photoFileId = getPhotoFileId(message);
  if (photoFileId) {
    return {
      type: "photo",
      fileId: photoFileId,
      textContent: "caption" in message ? message.caption ?? null : null
    };
  }

  if ("video" in message && message.video) {
    return {
      type: "video",
      fileId: message.video.file_id,
      textContent: "caption" in message ? message.caption ?? null : null
    };
  }

  return null;
}

function formatIngestAck(result: { mode: "created" | "appended"; entry: { eventDate: Date; createdAt: Date } }): string {
  if (result.mode === "appended") {
    return `✅ Добавлено к записи от ${formatRuTime(result.entry.createdAt)}`;
  }

  return `✅ Записано на ${formatRuDate(result.entry.eventDate)}`;
}

export function createMediaGroupMiddleware(
  flushDelayMs = MEDIA_GROUP_FLUSH_DELAY_MS
): (ctx: BotContext, next: NextFunction) => Promise<void> {
  const bufferByGroupKey = new Map<string, BufferedMediaGroup>();

  const flushGroup = async (groupKey: string): Promise<void> => {
    const buffered = bufferByGroupKey.get(groupKey);
    if (!buffered) {
      return;
    }

    bufferByGroupKey.delete(groupKey);

    if (!buffered.ctx.from) {
      return;
    }

    if (buffered.items.length === 0) {
      await buffered.ctx.reply(UNSUPPORTED_CONTENT_MESSAGE);
      return;
    }

    try {
      const user = await buffered.ctx.services.userService.findOrCreateUser({
        telegramId: BigInt(buffered.ctx.from.id),
        firstName: buffered.ctx.from.first_name,
        username: buffered.ctx.from.username ?? null
      });

      const baby = await buffered.ctx.services.babyService.getBabyByUser(user.id);
      if (!baby) {
        await buffered.ctx.reply(NO_DIARY_MESSAGE);
        return;
      }

      const result = await buffered.ctx.services.diaryService.createOrAppend({
        babyId: baby.id,
        authorId: user.id,
        items: buffered.items
      });

      await buffered.ctx.reply(formatIngestAck(result));
    } catch (error) {
      console.error("Failed to process media group", { error, groupKey });
      await buffered.ctx.reply("Не удалось сохранить медиагруппу. Попробуйте ещё раз.");
    }
  };

  return async (ctx: BotContext, next: NextFunction): Promise<void> => {
    if (!ctx.message || !("media_group_id" in ctx.message) || !ctx.message.media_group_id) {
      await next();
      return;
    }

    const groupKey = `${ctx.chat?.id ?? "chat"}:${ctx.from?.id ?? "user"}:${ctx.message.media_group_id}`;
    const item = extractItem(ctx.message);

    const existingBuffer = bufferByGroupKey.get(groupKey);
    if (existingBuffer) {
      if (item) {
        existingBuffer.items.push(item);
      }
      return;
    }

    setTimeout(() => {
      void flushGroup(groupKey);
    }, flushDelayMs);

    bufferByGroupKey.set(groupKey, {
      ctx,
      items: item ? [item] : []
    });

    return;
  };
}
