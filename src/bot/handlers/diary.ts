import type { EntryItem } from "@prisma/client";

import type { DiaryItemInput } from "../../services/diary.service.js";
import { TranscriptionError, TranscriptionErrorCode } from "../../services/transcription.errors.js";
import type { BotContext } from "../../types/bot.js";
import { downloadTelegramFile } from "../../utils/telegram.js";
import { buildEntryActionsKeyboard } from "../keyboards/entryActions.js";
import { formatRuDate, formatRuTime } from "../../utils/date.js";
import { notifyMembersAboutNewEntry } from "../notifications/newEntry.js";
import { env } from "../../config/env.js";

const UNSUPPORTED_CONTENT_MESSAGE = "Пока я умею сохранять только текст, фото, видео и голосовые сообщения 😊";
const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";
const VOICE_TOO_LONG_MESSAGE = "Голосовое слишком длинное (макс. 5 минут).";
const VOICE_TRANSCRIPTION_FAILED_MESSAGE = "Не удалось распознать голосовое сообщение. Попробуйте ещё раз.";
const VOICE_DOWNLOAD_FAILED_MESSAGE = "Не удалось загрузить голосовое сообщение.";

function getPhotoFileId(message: NonNullable<BotContext["message"]>): string | null {
  if (!("photo" in message) || !Array.isArray(message.photo) || message.photo.length === 0) {
    return null;
  }

  const largestPhoto = message.photo[message.photo.length - 1];
  return largestPhoto?.file_id ?? null;
}

function formatIngestAck(
  result: { mode: "created" | "appended"; entry: { eventDate: Date; createdAt: Date } },
  transcriptionPreview?: string
): string {
  let ack: string;
  if (result.mode === "appended") {
    ack = `✅ Добавлено к записи от ${formatRuTime(result.entry.createdAt)}`;
  } else {
    ack = `✅ Записано на ${formatRuDate(result.entry.eventDate)}`;
  }

  if (transcriptionPreview) {
    const preview = transcriptionPreview.length > 100
      ? transcriptionPreview.slice(0, 100).trimEnd() + "…"
      : transcriptionPreview;
    ack += `\n🎤 «${preview}»`;
  }

  return ack;
}

function collectTextContent(items: EntryItem[]): string {
  return items
    .map((item) => item.textContent?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
}

function generateAndApplyTags(ctx: BotContext, entry: { id: string; items: EntryItem[] }): void {
  const text = collectTextContent(entry.items);
  if (!text) {
    return;
  }

  void (async () => {
    try {
      const tags = await ctx.services.taggingService.generateTags(text);
      if (tags.length > 0) {
        await ctx.services.diaryService.updateTags(entry.id, tags);
      }
    } catch {
      // Fire-and-forget: never throw, never block the user
    }
  })();
}

export async function handleDiaryMessage(ctx: BotContext): Promise<void> {
  if (!ctx.from || !ctx.message) {
    return;
  }

  // --- Text messages ---
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

    if (result.mode === "created") {
      await ctx.reply(formatIngestAck(result), {
        reply_markup: buildEntryActionsKeyboard(result.entry.id)
      });
      await notifyMembersAboutNewEntry({
        notificationService: ctx.services.notificationService,
        babyId: baby.id,
        babyName: baby.name,
        authorId: user.id,
        authorFirstName: user.firstName,
        items: result.entry.items
      });
    } else {
      await ctx.reply(formatIngestAck(result));
    }

    generateAndApplyTags(ctx, result.entry);
    return;
  }

  // --- Media groups ---
  if ("media_group_id" in ctx.message && ctx.message.media_group_id) {
    // Grouped media is handled in media-group middleware.
    return;
  }

  // --- Voice messages ---
  if ("voice" in ctx.message && ctx.message.voice) {
    const voice = ctx.message.voice;

    if (voice.duration > 300) {
      await ctx.reply(VOICE_TOO_LONG_MESSAGE);
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

    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadTelegramFile(ctx.api, env.BOT_TOKEN, voice.file_id);
    } catch {
      await ctx.reply(VOICE_DOWNLOAD_FAILED_MESSAGE);
      return;
    }

    let transcription: string;
    try {
      transcription = await ctx.services.transcriptionService.transcribe(
        fileBuffer,
        `voice_${voice.file_unique_id}.ogg`,
        voice.duration
      );
    } catch (error) {
      if (error instanceof TranscriptionError && error.code === TranscriptionErrorCode.durationTooLong) {
        await ctx.reply(VOICE_TOO_LONG_MESSAGE);
        return;
      }
      await ctx.reply(VOICE_TRANSCRIPTION_FAILED_MESSAGE);
      return;
    }

    const item: DiaryItemInput = {
      type: "voice",
      fileId: voice.file_id,
      textContent: transcription
    };

    const result = await ctx.services.diaryService.createOrAppend({
      babyId: baby.id,
      authorId: user.id,
      items: [item]
    });

    if (result.mode === "created") {
      await ctx.reply(formatIngestAck(result, transcription), {
        reply_markup: buildEntryActionsKeyboard(result.entry.id)
      });
      await notifyMembersAboutNewEntry({
        notificationService: ctx.services.notificationService,
        babyId: baby.id,
        babyName: baby.name,
        authorId: user.id,
        authorFirstName: user.firstName,
        items: result.entry.items
      });
    } else {
      await ctx.reply(formatIngestAck(result, transcription));
    }

    generateAndApplyTags(ctx, result.entry);
    return;
  }

  // --- Single photo / video ---
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
      thumbnailFileId: ctx.message.video.thumbnail?.file_id ?? null,
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

  if (result.mode === "created") {
    await ctx.reply(formatIngestAck(result), {
      reply_markup: buildEntryActionsKeyboard(result.entry.id)
    });
    await notifyMembersAboutNewEntry({
      notificationService: ctx.services.notificationService,
      babyId: baby.id,
      babyName: baby.name,
      authorId: user.id,
      authorFirstName: user.firstName,
      items: result.entry.items
    });
  } else {
    await ctx.reply(formatIngestAck(result));
  }

  generateAndApplyTags(ctx, result.entry);
}
