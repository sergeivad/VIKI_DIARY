import { describe, expect, it, vi } from "vitest";

import { handleHistory } from "../../src/bot/handlers/history.js";

function buildCtx(params?: {
  baby?: { id: string; name: string } | null;
  historyEntries?: Array<Record<string, unknown>>;
  totalPages?: number;
}) {
  const baby = params?.baby === undefined ? { id: "baby-1", name: "Вики" } : params.baby;
  const historyEntries = params?.historyEntries ?? [
    {
      id: "entry-1",
      eventDate: new Date("2026-02-22T00:00:00.000Z"),
      author: {
        id: "user-1",
        firstName: "Сергей",
        username: "sergei"
      },
      items: [
        {
          id: "item-1",
          entryId: "entry-1",
          type: "text",
          textContent: "Вика сегодня впервые села сама!",
          fileId: null,
          orderIndex: 0,
          createdAt: new Date("2026-02-22T12:00:00.000Z")
        },
        {
          id: "item-2",
          entryId: "entry-1",
          type: "photo",
          textContent: null,
          fileId: "photo-1",
          orderIndex: 1,
          createdAt: new Date("2026-02-22T12:00:01.000Z")
        },
        {
          id: "item-3",
          entryId: "entry-1",
          type: "video",
          textContent: null,
          fileId: "video-1",
          orderIndex: 2,
          createdAt: new Date("2026-02-22T12:00:02.000Z")
        }
      ]
    }
  ];

  return {
    from: {
      id: 42,
      first_name: "Sergei",
      username: "sergei"
    },
    services: {
      userService: {
        findOrCreateUser: vi.fn().mockResolvedValue({
          id: "user-1"
        })
      },
      babyService: {
        getBabyByUser: vi.fn().mockResolvedValue(baby)
      },
      diaryService: {
        getHistory: vi.fn().mockResolvedValue({
          entries: historyEntries,
          total: historyEntries.length,
          page: 1,
          limit: 1,
          totalPages: params?.totalPages ?? 1
        })
      }
    },
    reply: vi.fn().mockResolvedValue(undefined)
  };
}

describe("handleHistory", () => {
  it("renders first history page with media counters and navigation", async () => {
    const ctx = buildCtx({ totalPages: 2 });

    await handleHistory(ctx as never);

    expect(ctx.services.diaryService.getHistory).toHaveBeenCalledWith({
      babyId: "baby-1",
      actorId: "user-1",
      page: 1,
      limit: 1
    });

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [message, options] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(message).toBe(
      "📝 22 февраля 2026 г. — Сергей\n\nВика сегодня впервые села сама!\n\n🖼 1 фото · 🎥 1 видео"
    );
    expect(options.reply_markup.inline_keyboard).toEqual([
      [{ text: "📎 Показать медиа", callback_data: "history:media:entry-1:1" }],
      [{ text: "Вперёд ▶️", callback_data: "history:nav:next:2" }]
    ]);
  });

  it("replies with onboarding hint when user has no diary", async () => {
    const ctx = buildCtx({ baby: null });

    await handleHistory(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке."
    );
    expect(ctx.services.diaryService.getHistory).not.toHaveBeenCalled();
  });

  it("replies with empty state when no entries found", async () => {
    const ctx = buildCtx({
      historyEntries: [],
      totalPages: 0
    });

    await handleHistory(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("История пока пуста. Добавьте первую запись.");
  });
});
