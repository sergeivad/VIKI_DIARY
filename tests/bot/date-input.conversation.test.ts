import { describe, expect, it, vi } from "vitest";

import { dateInputConversation } from "../../src/bot/conversations/dateInput.js";
import { DiaryDomainError, DiaryErrorCode } from "../../src/services/diary.errors.js";

describe("dateInputConversation", () => {
  it("updates event date after valid manual input", async () => {
    const waitFor = vi.fn().mockResolvedValue({ message: { text: "21.02.2026" } });
    const updateEventDate = vi.fn().mockResolvedValue({
      id: "entry-1",
      eventDate: new Date("2026-02-21T00:00:00.000Z")
    });

    const ctx = {
      services: {
        diaryService: {
          updateEventDate
        }
      },
      api: {
        editMessageText: vi.fn()
      },
      reply: vi.fn()
    };

    await dateInputConversation(
      { waitFor } as never,
      ctx as never,
      {
        entryId: "entry-1",
        actorId: "user-1",
        sourceChatId: 101,
        sourceMessageId: 77
      }
    );

    expect(updateEventDate).toHaveBeenCalledWith({
      entryId: "entry-1",
      actorId: "user-1",
      eventDate: new Date("2026-02-21T00:00:00.000Z")
    });
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(
      101,
      77,
      "📅 Дата записи изменена на 21.02.2026",
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    );
  });

  it("re-prompts user on invalid input", async () => {
    const waitFor = vi
      .fn()
      .mockResolvedValueOnce({ message: { text: "2026-02-21" } })
      .mockResolvedValueOnce({ message: { text: "21.02.2026" } });

    const ctx = {
      services: {
        diaryService: {
          updateEventDate: vi.fn().mockResolvedValue({
            id: "entry-1",
            eventDate: new Date("2026-02-21T00:00:00.000Z")
          })
        }
      },
      api: {
        editMessageText: vi.fn()
      },
      reply: vi.fn()
    };

    await dateInputConversation(
      { waitFor } as never,
      ctx as never,
      {
        entryId: "entry-1",
        actorId: "user-1",
        sourceChatId: 101,
        sourceMessageId: 77
      }
    );

    expect(ctx.reply).toHaveBeenCalledWith("Введите дату в формате дд.мм.гггг.");
    expect(ctx.reply).toHaveBeenCalledWith("Введите дату в формате дд.мм.гггг.");
    expect(waitFor).toHaveBeenCalledTimes(2);
  });

  it("shows mapped domain error message", async () => {
    const waitFor = vi.fn().mockResolvedValue({ message: { text: "21.02.2026" } });
    const ctx = {
      services: {
        diaryService: {
          updateEventDate: vi
            .fn()
            .mockRejectedValue(
              new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found")
            )
        }
      },
      api: {
        editMessageText: vi.fn()
      },
      reply: vi.fn()
    };

    await dateInputConversation(
      { waitFor } as never,
      ctx as never,
      {
        entryId: "entry-1",
        actorId: "user-1",
        sourceChatId: 101,
        sourceMessageId: 77
      }
    );

    expect(ctx.reply).toHaveBeenCalledWith("Запись не найдена или уже удалена.");
  });

  it("falls back to chat confirmation when source message edit fails", async () => {
    const waitFor = vi.fn().mockResolvedValue({ message: { text: "21.02.2026" } });
    const updateEventDate = vi.fn().mockResolvedValue({
      id: "entry-1",
      eventDate: new Date("2026-02-21T00:00:00.000Z")
    });
    const ctx = {
      services: {
        diaryService: {
          updateEventDate
        }
      },
      api: {
        editMessageText: vi.fn().mockRejectedValue(new Error("message to edit not found"))
      },
      reply: vi.fn()
    };

    await dateInputConversation(
      { waitFor } as never,
      ctx as never,
      {
        entryId: "entry-1",
        actorId: "user-1",
        sourceChatId: 101,
        sourceMessageId: 77
      }
    );

    expect(updateEventDate).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith(
      "📅 Дата записи изменена на 21.02.2026",
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    );
  });
});
