import { describe, expect, it, vi } from "vitest";

import { handleDiaryMessage } from "../../src/bot/handlers/diary.js";

describe("handleDiaryMessage", () => {
  it("creates entry for text message", async () => {
    const notifyOtherMembers = vi.fn().mockResolvedValue(undefined);
    const createOrAppend = vi.fn().mockResolvedValue({
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
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        text: "Вика улыбнулась"
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1", firstName: "Sergei" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Вики" })
        },
        diaryService: {
          createOrAppend
        },
        notificationService: {
          notifyOtherMembers
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(createOrAppend).toHaveBeenCalledWith({
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
    expect(notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«Вика улыбнулась»"
    });
  });

  it("appends to open entry and replies with entry time", async () => {
    const notifyOtherMembers = vi.fn();
    const createOrAppend = vi.fn().mockResolvedValue({
      mode: "appended",
      entry: {
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T14:30:00.000Z")
      }
    });

    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        text: "И еще одно событие"
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1", firstName: "Sergei" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Вики" })
        },
        diaryService: {
          createOrAppend
        },
        notificationService: {
          notifyOtherMembers
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("✅ Добавлено к записи от 17:30");
    expect(notifyOtherMembers).not.toHaveBeenCalled();
  });

  it("saves single photo with caption", async () => {
    const notifyOtherMembers = vi.fn().mockResolvedValue(undefined);
    const createOrAppend = vi.fn().mockResolvedValue({
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
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        photo: [{ file_id: "small" }, { file_id: "large" }],
        caption: "caption text"
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1", firstName: "Sergei" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Вики" })
        },
        diaryService: {
          createOrAppend
        },
        notificationService: {
          notifyOtherMembers
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "photo", fileId: "large", textContent: "caption text" }]
    });
    expect(notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«caption text»\n🖼 1 фото"
    });
  });

  it("saves single video with caption", async () => {
    const notifyOtherMembers = vi.fn().mockResolvedValue(undefined);
    const createOrAppend = vi.fn().mockResolvedValue({
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
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        video: { file_id: "video-1" },
        caption: "video caption"
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1", firstName: "Sergei" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Вики" })
        },
        diaryService: {
          createOrAppend
        },
        notificationService: {
          notifyOtherMembers
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "video", fileId: "video-1", textContent: "video caption" }]
    });
    expect(notifyOtherMembers).toHaveBeenCalledWith({
      babyId: "baby-1",
      excludeUserId: "user-1",
      text: "📝 Sergei добавил(а) запись в дневник Вики:\n«video caption»\n🎥 1 видео"
    });
  });

  it("replies with unsupported content message", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        sticker: { file_id: "sticker-1" }
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn()
        },
        babyService: {
          getBabyByUser: vi.fn()
        },
        diaryService: {
          createOrAppend: vi.fn()
        },
        notificationService: {
          notifyOtherMembers: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Пока я умею сохранять только текст, фото и видео 😊");
  });

  it("replies when user has no diary", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      message: {
        text: "Событие"
      },
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue(null)
        },
        diaryService: {
          createOrAppend: vi.fn()
        },
        notificationService: {
          notifyOtherMembers: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке."
    );
    expect(ctx.services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });
});
