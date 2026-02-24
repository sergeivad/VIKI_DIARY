import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  env: { BOT_TOKEN: "test-token" }
}));

vi.mock("../../src/utils/telegram.js", () => ({
  downloadTelegramFile: vi.fn()
}));

import { handleDiaryMessage } from "../../src/bot/handlers/diary.js";
import { downloadTelegramFile } from "../../src/utils/telegram.js";
import { TranscriptionError, TranscriptionErrorCode } from "../../src/services/transcription.errors.js";

function buildServices(overrides: Record<string, unknown> = {}) {
  return {
    userService: {
      findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1", firstName: "Sergei" })
    },
    babyService: {
      getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Вики" })
    },
    diaryService: {
      createOrAppend: vi.fn().mockResolvedValue({
        mode: "created",
        entry: {
          id: "entry-1",
          eventDate: new Date("2026-02-22T00:00:00.000Z"),
          createdAt: new Date("2026-02-22T12:00:00.000Z"),
          items: []
        }
      }),
      updateTags: vi.fn().mockResolvedValue(undefined)
    },
    notificationService: {
      notifyOtherMembers: vi.fn().mockResolvedValue(undefined)
    },
    transcriptionService: {
      transcribe: vi.fn().mockResolvedValue("Вика сегодня гуляла")
    },
    taggingService: {
      generateTags: vi.fn().mockResolvedValue([])
    },
    ...overrides
  };
}

describe("handleDiaryMessage", () => {
  it("creates entry for text message", async () => {
    const services = buildServices();
    services.diaryService.createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        id: "entry-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z"),
        items: [
          {
            id: "item-1",
            entryId: "entry-1",
            type: "text",
            textContent: "Вика улыбнулась",
            fileId: null,
            orderIndex: 0,
            createdAt: new Date("2026-02-22T12:00:00.000Z")
          }
        ]
      }
    });

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: { text: "Вика улыбнулась" },
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "text", textContent: "Вика улыбнулась" }]
    });
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(replyArgs[0]).toBe("✅ Записано на 22.02.2026");
    expect(replyArgs[1].reply_markup.inline_keyboard).toEqual([
      [{ text: "📅 Изменить дату", callback_data: "entry:date:entry-1" }],
      [{ text: "🗑 Удалить", callback_data: "entry:delete:entry-1" }]
    ]);
    expect(services.notificationService.notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«Вика улыбнулась»"
    });
  });

  it("appends to open entry and replies with entry time", async () => {
    const services = buildServices();
    services.diaryService.createOrAppend = vi.fn().mockResolvedValue({
      mode: "appended",
      entry: {
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T14:30:00.000Z"),
        items: []
      }
    });

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: { text: "И еще одно событие" },
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("✅ Добавлено к записи от 17:30");
    expect(services.notificationService.notifyOtherMembers).not.toHaveBeenCalled();
  });

  it("saves single photo with caption", async () => {
    const services = buildServices();
    services.diaryService.createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        id: "entry-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z"),
        items: [
          {
            id: "item-1",
            entryId: "entry-1",
            type: "photo",
            textContent: "caption text",
            fileId: "large",
            orderIndex: 0,
            createdAt: new Date("2026-02-22T12:00:00.000Z")
          }
        ]
      }
    });

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        photo: [{ file_id: "small" }, { file_id: "large" }],
        caption: "caption text"
      },
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "photo", fileId: "large", textContent: "caption text" }]
    });
    expect(services.notificationService.notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«caption text»\n🖼 1 фото"
    });
  });

  it("saves single video with caption", async () => {
    const services = buildServices();
    services.diaryService.createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        id: "entry-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z"),
        items: [
          {
            id: "item-1",
            entryId: "entry-1",
            type: "video",
            textContent: "video caption",
            fileId: "video-1",
            orderIndex: 0,
            createdAt: new Date("2026-02-22T12:00:00.000Z")
          }
        ]
      }
    });

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        video: { file_id: "video-1" },
        caption: "video caption"
      },
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "video", fileId: "video-1", textContent: "video caption" }]
    });
    expect(services.notificationService.notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«video caption»\n🎥 1 видео"
    });
  });

  it("replies with unsupported content message for sticker", async () => {
    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: { sticker: { file_id: "sticker-1" } },
      services: buildServices(),
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Пока я умею сохранять только текст, фото, видео и голосовые сообщения 😊"
    );
  });

  it("replies when user has no diary", async () => {
    const services = buildServices();
    services.babyService.getBabyByUser = vi.fn().mockResolvedValue(null);

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: { text: "Событие" },
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке."
    );
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });

  // --- Voice message tests ---

  it("creates entry for voice message with transcription", async () => {
    const services = buildServices();
    services.diaryService.createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        id: "entry-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z"),
        items: [
          {
            id: "item-1",
            entryId: "entry-1",
            type: "voice",
            textContent: "Вика сегодня гуляла",
            fileId: "voice-file-1",
            orderIndex: 0,
            createdAt: new Date("2026-02-22T12:00:00.000Z")
          }
        ]
      }
    });

    vi.mocked(downloadTelegramFile).mockResolvedValue(Buffer.from("audio-data"));

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        voice: { file_id: "voice-file-1", file_unique_id: "unique-1", duration: 15 }
      },
      api: {},
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(downloadTelegramFile).toHaveBeenCalledWith(ctx.api, "test-token", "voice-file-1");
    expect(services.transcriptionService.transcribe).toHaveBeenCalledWith(
      Buffer.from("audio-data"),
      "voice_unique-1.ogg",
      15
    );
    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "voice", fileId: "voice-file-1", textContent: "Вика сегодня гуляла" }]
    });
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const replyText = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(replyText).toContain("✅ Записано на 22.02.2026");
    expect(replyText).toContain("🎤 «Вика сегодня гуляла»");
  });

  it("rejects voice message longer than 5 minutes", async () => {
    const services = buildServices();

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        voice: { file_id: "voice-file-1", file_unique_id: "unique-1", duration: 301 }
      },
      api: {},
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Голосовое слишком длинное (макс. 5 минут).");
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });

  it("replies with error when voice download fails", async () => {
    const services = buildServices();
    vi.mocked(downloadTelegramFile).mockRejectedValue(new Error("network error"));

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        voice: { file_id: "voice-file-1", file_unique_id: "unique-1", duration: 10 }
      },
      api: {},
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Не удалось загрузить голосовое сообщение.");
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });

  it("replies with error when transcription fails", async () => {
    const services = buildServices();
    vi.mocked(downloadTelegramFile).mockResolvedValue(Buffer.from("audio-data"));
    services.transcriptionService.transcribe = vi.fn().mockRejectedValue(
      new TranscriptionError(TranscriptionErrorCode.transcriptionFailed, "API error")
    );

    const ctx = {
      from: { id: 42, first_name: "Sergei", username: "sergei" },
      message: {
        voice: { file_id: "voice-file-1", file_unique_id: "unique-1", duration: 10 }
      },
      api: {},
      services,
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Не удалось распознать голосовое сообщение. Попробуйте ещё раз."
    );
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });
});
