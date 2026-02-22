import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleEntryCallbacks } from "../../src/bot/handlers/callbacks.js";
import { DiaryDomainError, DiaryErrorCode } from "../../src/services/diary.errors.js";

function buildCtx(data: string) {
  return {
    from: {
      id: 42,
      first_name: "Sergei",
      username: "sergei"
    },
    chat: {
      id: 101
    },
    callbackQuery: {
      data,
      message: {
        message_id: 77
      }
    },
    services: {
      userService: {
        findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
      },
      diaryService: {
        updateEventDate: vi.fn().mockResolvedValue({
          id: "entry-1",
          eventDate: new Date("2026-02-21T00:00:00.000Z")
        }),
        deleteEntry: vi.fn().mockResolvedValue(undefined)
      }
    },
    conversation: {
      enter: vi.fn().mockResolvedValue(undefined)
    },
    editMessageText: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined)
  };
}

describe("handleEntryCallbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens date menu with quick date buttons", async () => {
    const ctx = buildCtx("entry:date:entry-1");

    await handleEntryCallbacks(ctx as never);

    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const args = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe("📅 Выберите дату события:");
    expect(args[1].reply_markup.inline_keyboard).toEqual([
      [
        { text: "Вчера", callback_data: "entry:date:quick:yesterday:entry-1" },
        { text: "Позавчера", callback_data: "entry:date:quick:day_before:entry-1" }
      ],
      [{ text: "Ввести дату", callback_data: "entry:date:manual:entry-1" }],
      [{ text: "Отмена", callback_data: "entry:date:cancel:entry-1" }]
    ]);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });

  it("updates date with quick yesterday action", async () => {
    const ctx = buildCtx("entry:date:quick:yesterday:entry-1");

    await handleEntryCallbacks(ctx as never);

    expect(ctx.services.diaryService.updateEventDate).toHaveBeenCalledWith({
      entryId: "entry-1",
      actorId: "user-1",
      eventDate: new Date("2026-02-21T00:00:00.000Z")
    });
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      "📅 Дата записи изменена на 21.02.2026",
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });

  it("starts manual date conversation", async () => {
    const ctx = buildCtx("entry:date:manual:entry-1");

    await handleEntryCallbacks(ctx as never);

    expect(ctx.conversation.enter).toHaveBeenCalledWith("dateInputConversation", {
      entryId: "entry-1",
      actorId: "user-1",
      sourceChatId: 101,
      sourceMessageId: 77
    });
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
  });

  it("opens delete confirmation and then deletes entry", async () => {
    const openCtx = buildCtx("entry:delete:entry-1");
    await handleEntryCallbacks(openCtx as never);

    expect(openCtx.editMessageText).toHaveBeenCalledWith(
      "Удалить запись? Это действие нельзя отменить.",
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    );

    const confirmCtx = buildCtx("entry:delete:confirm:entry-1");
    await handleEntryCallbacks(confirmCtx as never);

    expect(confirmCtx.services.diaryService.deleteEntry).toHaveBeenCalledWith({
      entryId: "entry-1",
      actorId: "user-1"
    });
    expect(confirmCtx.editMessageText).toHaveBeenCalledWith("🗑 Запись удалена.");
  });

  it("shows domain error via callback alert", async () => {
    const ctx = buildCtx("entry:delete:confirm:entry-1");
    ctx.services.diaryService.deleteEntry = vi
      .fn()
      .mockRejectedValue(
        new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found")
      );

    await handleEntryCallbacks(ctx as never);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: "Запись не найдена или уже удалена.",
      show_alert: true
    });
  });
});

