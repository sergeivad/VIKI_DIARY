import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMediaGroupMiddleware } from "../../src/bot/middleware/mediaGroup.js";

function buildServices(hasDiary = true) {
  return {
    userService: {
      findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
    },
    babyService: {
      getBabyByUser: vi.fn().mockResolvedValue(hasDiary ? { id: "baby-1" } : null)
    },
    diaryService: {
      createOrAppend: vi.fn().mockResolvedValue({
        mode: "created",
        entry: {
          id: "entry-1",
          eventDate: new Date("2026-02-22T00:00:00.000Z"),
          createdAt: new Date("2026-02-22T12:00:00.000Z")
        }
      })
    }
  };
}

function buildCtx(params: {
  mediaGroupId: string;
  message: Record<string, unknown>;
  services: ReturnType<typeof buildServices>;
}) {
  return {
    from: {
      id: 42,
      first_name: "Sergei",
      username: "sergei"
    },
    chat: {
      id: 101
    },
    message: {
      media_group_id: params.mediaGroupId,
      ...params.message
    },
    services: params.services,
    reply: vi.fn()
  };
}

describe("media group middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers one media group and saves once", async () => {
    const middleware = createMediaGroupMiddleware(100);
    const services = buildServices();

    const ctx1 = buildCtx({
      mediaGroupId: "group-1",
      services,
      message: {
        photo: [{ file_id: "p1-small" }, { file_id: "p1-large" }],
        caption: "group caption"
      }
    });

    const ctx2 = buildCtx({
      mediaGroupId: "group-1",
      services,
      message: {
        photo: [{ file_id: "p2-small" }, { file_id: "p2-large" }]
      }
    });

    const ctx3 = buildCtx({
      mediaGroupId: "group-1",
      services,
      message: {
        video: { file_id: "v1" }
      }
    });

    const next = vi.fn();

    await middleware(ctx1 as never, next);
    await middleware(ctx2 as never, next);
    await middleware(ctx3 as never, next);

    expect(next).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledTimes(1);
    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [
        { type: "photo", fileId: "p1-large", textContent: "group caption" },
        { type: "photo", fileId: "p2-large", textContent: null },
        { type: "video", fileId: "v1", textContent: null }
      ]
    });

    expect(ctx1.reply).toHaveBeenCalledTimes(1);
    const replyArgs = (ctx1.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(replyArgs[0]).toBe("✅ Записано на 22.02.2026");
    expect(replyArgs[1].reply_markup.inline_keyboard).toEqual([
      [{ text: "📅 Изменить дату", callback_data: "entry:date:entry-1" }],
      [{ text: "🗑 Удалить", callback_data: "entry:delete:entry-1" }]
    ]);
    expect(ctx2.reply).not.toHaveBeenCalled();
    expect(ctx3.reply).not.toHaveBeenCalled();
  });

  it("separates different media groups", async () => {
    const middleware = createMediaGroupMiddleware(100);
    const services = buildServices();

    const next = vi.fn();

    await middleware(
      buildCtx({
        mediaGroupId: "group-1",
        services,
        message: {
          photo: [{ file_id: "p1" }]
        }
      }) as never,
      next
    );

    await middleware(
      buildCtx({
        mediaGroupId: "group-2",
        services,
        message: {
          video: { file_id: "v1" }
        }
      }) as never,
      next
    );

    await vi.advanceTimersByTimeAsync(120);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledTimes(2);
  });

  it("replies with onboarding hint when user has no diary", async () => {
    const middleware = createMediaGroupMiddleware(100);
    const services = buildServices(false);
    const ctx = buildCtx({
      mediaGroupId: "group-1",
      services,
      message: {
        photo: [{ file_id: "p1" }]
      }
    });

    await middleware(ctx as never, vi.fn());
    await vi.advanceTimersByTimeAsync(120);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке."
    );
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });

  it("ignores unsupported messages inside media group", async () => {
    const middleware = createMediaGroupMiddleware(100);
    const services = buildServices();

    const next = vi.fn();

    await middleware(
      buildCtx({
        mediaGroupId: "group-1",
        services,
        message: {
          document: { file_id: "doc-1" }
        }
      }) as never,
      next
    );

    await middleware(
      buildCtx({
        mediaGroupId: "group-1",
        services,
        message: {
          photo: [{ file_id: "p1" }]
        }
      }) as never,
      next
    );

    await vi.advanceTimersByTimeAsync(120);

    expect(services.diaryService.createOrAppend).toHaveBeenCalledTimes(1);
    expect(services.diaryService.createOrAppend).toHaveBeenCalledWith({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "photo", fileId: "p1", textContent: null }]
    });
  });

  it("replies with unsupported message when group has no supported media", async () => {
    const middleware = createMediaGroupMiddleware(100);
    const services = buildServices();
    const ctx = buildCtx({
      mediaGroupId: "group-unsupported",
      services,
      message: {
        document: { file_id: "doc-1" }
      }
    });

    await middleware(ctx as never, vi.fn());
    await vi.advanceTimersByTimeAsync(120);

    expect(ctx.reply).toHaveBeenCalledWith("Пока я умею сохранять только текст, фото и видео 😊");
    expect(services.diaryService.createOrAppend).not.toHaveBeenCalled();
  });
});
