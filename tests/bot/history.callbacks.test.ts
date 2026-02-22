import { describe, expect, it, vi } from "vitest";

import { handleHistoryCallbacks } from "../../src/bot/handlers/historyCallbacks.js";
import { DiaryDomainError, DiaryErrorCode } from "../../src/services/diary.errors.js";

function buildCtx(data: string) {
  return {
    from: {
      id: 42,
      first_name: "Sergei",
      username: "sergei"
    },
    callbackQuery: {
      data
    },
    services: {
      userService: {
        findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
      },
      babyService: {
        getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1" })
      },
      diaryService: {
        getEntryById: vi.fn().mockResolvedValue({
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
              type: "photo",
              textContent: null,
              fileId: "photo-1",
              orderIndex: 0,
              createdAt: new Date("2026-02-22T12:00:00.000Z")
            },
            {
              id: "item-2",
              entryId: "entry-1",
              type: "video",
              textContent: null,
              fileId: "video-1",
              orderIndex: 1,
              createdAt: new Date("2026-02-22T12:00:01.000Z")
            }
          ]
        }),
        getHistory: vi.fn().mockResolvedValue({
          entries: [
            {
              id: "entry-2",
              eventDate: new Date("2026-02-21T00:00:00.000Z"),
              author: {
                id: "user-2",
                firstName: "Елена",
                username: "elena"
              },
              items: [
                {
                  id: "item-10",
                  entryId: "entry-2",
                  type: "text",
                  textContent: "Прогулка в парке",
                  fileId: null,
                  orderIndex: 0,
                  createdAt: new Date("2026-02-21T13:00:00.000Z")
                }
              ]
            }
          ],
          total: 2,
          page: 2,
          limit: 1,
          totalPages: 2
        })
      }
    },
    replyWithPhoto: vi.fn().mockResolvedValue(undefined),
    replyWithVideo: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined)
  };
}

describe("handleHistoryCallbacks", () => {
  it("sends media items for selected entry", async () => {
    const ctx = buildCtx("history:media:entry-1:1");

    await handleHistoryCallbacks(ctx as never);

    expect(ctx.services.diaryService.getEntryById).toHaveBeenCalledWith({
      entryId: "entry-1",
      actorId: "user-1"
    });
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith("photo-1");
    expect(ctx.replyWithVideo).toHaveBeenCalledWith("video-1");
  });

  it("shows alert when selected entry has no media", async () => {
    const ctx = buildCtx("history:media:entry-1:1");
    ctx.services.diaryService.getEntryById = vi.fn().mockResolvedValue({
      id: "entry-1",
      items: []
    });

    await handleHistoryCallbacks(ctx as never);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: "В записи нет медиа.",
      show_alert: true
    });
    expect(ctx.replyWithPhoto).not.toHaveBeenCalled();
    expect(ctx.replyWithVideo).not.toHaveBeenCalled();
  });

  it("navigates between history pages", async () => {
    const ctx = buildCtx("history:nav:next:2");

    await handleHistoryCallbacks(ctx as never);

    expect(ctx.services.diaryService.getHistory).toHaveBeenCalledWith({
      babyId: "baby-1",
      actorId: "user-1",
      page: 2,
      limit: 1
    });
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "📝 21 февраля 2026 г. — Елена\n\nПрогулка в парке",
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    );

    const args = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1].reply_markup.inline_keyboard).toEqual([
      [{ text: "📎 Показать медиа", callback_data: "history:media:entry-2:2" }],
      [{ text: "◀️ Назад", callback_data: "history:nav:prev:1" }]
    ]);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });

  it("maps domain errors to callback alert", async () => {
    const ctx = buildCtx("history:media:entry-1:1");
    ctx.services.diaryService.getEntryById = vi
      .fn()
      .mockRejectedValue(
        new DiaryDomainError(DiaryErrorCode.entryAccessDenied, "Access denied")
      );

    await handleHistoryCallbacks(ctx as never);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: "У вас нет доступа к этой записи.",
      show_alert: true
    });
  });

  it("ignores invalid callback payload", async () => {
    const ctx = buildCtx("history:unknown");

    await handleHistoryCallbacks(ctx as never);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });
});
