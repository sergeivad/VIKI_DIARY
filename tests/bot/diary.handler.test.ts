import { describe, expect, it, vi } from "vitest";

import { handleDiaryMessage } from "../../src/bot/handlers/diary.js";

describe("handleDiaryMessage", () => {
  it("creates entry for text message", async () => {
    const createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z")
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
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1" })
        },
        diaryService: {
          createOrAppend
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
    expect(ctx.reply).toHaveBeenCalledWith("✅ Записано на 22.02.2026");
  });

  it("appends to open entry and replies with entry time", async () => {
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
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1" })
        },
        diaryService: {
          createOrAppend
        }
      },
      reply: vi.fn()
    };

    await handleDiaryMessage(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("✅ Добавлено к записи от 14:30");
  });

  it("saves single photo with caption", async () => {
    const createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z")
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
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1" })
        },
        diaryService: {
          createOrAppend
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
  });

  it("saves single video with caption", async () => {
    const createOrAppend = vi.fn().mockResolvedValue({
      mode: "created",
      entry: {
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        createdAt: new Date("2026-02-22T12:00:00.000Z")
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
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1" })
        },
        diaryService: {
          createOrAppend
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
