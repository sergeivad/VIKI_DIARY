import type { DiaryItemInput } from "../../services/diary.service.js";
import type { BotContext } from "../../types/bot.js";
import { formatRuDate, formatRuTime } from "../../utils/date.js";

const UNSUPPORTED_CONTENT_MESSAGE = "Пока я умею сохранять только текст, фото и видео 😊";
const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";

function getPhotoFileId(message: NonNullable<BotContext["message"]>): string | null {
  if (!("photo" in message) || !Array.isArray(message.photo) || message.photo.length === 0) {
    return null;
  }

  const largestPhoto = message.photo[message.photo.length - 1];
  return largestPhoto?.file_id ?? null;
}

function formatIngestAck(result: { mode: "created" | "appended"; entry: { eventDate: Date; createdAt: Date } }): string {
  if (result.mode === "appended") {
    return `✅ Добавлено к записи от ${formatRuTime(result.entry.createdAt)}`;
  }

  return `✅ Записано на ${formatRuDate(result.entry.eventDate)}`;
}

export async function handleDiaryMessage(ctx: BotContext): Promise<void> {
  if (!ctx.from || !ctx.message) {
    return;
  }

  if ("text" in ctx.message && typeof ctx.message.text === "string") {
    if (ctx.message.text.startsWith("/")) {
      return;
    }

    const text = ctx.message.text.trim();
    if (text.length === 0) {
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

    const result = await ctx.services.diaryService.createOrAppend({
      babyId: baby.id,
      authorId: user.id,
      items: [{
        type: "text",
        textContent: text
      }]
    });

    await ctx.reply(formatIngestAck(result));
    return;
  }

  if ("media_group_id" in ctx.message && ctx.message.media_group_id) {
    // Grouped media is handled in media-group middleware.
    return;
  }

  let item: DiaryItemInput | null = null;

  const photoFileId = getPhotoFileId(ctx.message);
  if (photoFileId) {
    item = {
      type: "photo",
      fileId: photoFileId,
      textContent: "caption" in ctx.message ? ctx.message.caption ?? null : null
    };
  } else if ("video" in ctx.message && ctx.message.video) {
    item = {
      type: "video",
      fileId: ctx.message.video.file_id,
      textContent: "caption" in ctx.message ? ctx.message.caption ?? null : null
    };
  }

  if (!item) {
    await ctx.reply(UNSUPPORTED_CONTENT_MESSAGE);
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

  const result = await ctx.services.diaryService.createOrAppend({
    babyId: baby.id,
    authorId: user.id,
    items: [item]
  });

  await ctx.reply(formatIngestAck(result));
}
