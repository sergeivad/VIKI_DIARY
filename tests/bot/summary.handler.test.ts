import { afterEach, describe, expect, it, vi } from "vitest";

import { generateSummaryMessage } from "../../src/bot/handlers/summary.js";

function buildCtx(entries: Array<Record<string, unknown>>) {
  return {
    services: {
      diaryService: {
        getEntriesForDateRange: vi.fn().mockResolvedValue(entries),
      },
      summaryService: {
        generateSummary: vi.fn().mockResolvedValue("Итог месяца"),
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateSummaryMessage", () => {
  it("uses stored photo descriptions from item.description", async () => {
    const ctx = buildCtx([
      {
        eventDate: new Date("2026-01-06T00:00:00.000Z"),
        items: [
          { type: "text", textContent: "Прогулка", description: null },
          {
            type: "photo",
            fileId: "tg-photo-1",
            s3Key: null,
            textContent: null,
            description: "Ребенок на улице",
          },
          {
            type: "photo",
            fileId: null,
            s3Key: "uploads/u/s3-photo-1.jpg",
            textContent: null,
            description: "Ребенок на коврике дома",
          },
        ],
      },
    ]);

    const message = await generateSummaryMessage(
      ctx as never,
      "user-1",
      "baby-1",
      "Вика",
      new Date("2025-06-15T00:00:00.000Z"),
      2026,
      1,
    );

    expect(ctx.services.summaryService.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        entriesText: [
          "[2026-01-06] Прогулка [Фото: Ребенок на улице] [Фото: Ребенок на коврике дома]",
        ],
      }),
    );

    expect(message).toContain("📋 Конспект за");
    expect(message).toContain("Итог месяца");
  });

  it("skips photos with null description", async () => {
    const ctx = buildCtx([
      {
        eventDate: new Date("2026-01-07T00:00:00.000Z"),
        items: [
          {
            type: "photo",
            fileId: "tg-photo-2",
            s3Key: null,
            textContent: null,
            description: null,
          },
        ],
      },
    ]);

    await generateSummaryMessage(
      ctx as never,
      "user-1",
      "baby-1",
      "Вика",
      new Date("2025-06-15T00:00:00.000Z"),
      2026,
      1,
    );

    expect(ctx.services.summaryService.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        entriesText: ["[2026-01-07] —"],
      }),
    );
  });

  it("returns no-entries message when entries list is empty", async () => {
    const ctx = buildCtx([]);

    const message = await generateSummaryMessage(
      ctx as never,
      "user-1",
      "baby-1",
      "Вика",
      new Date("2025-06-15T00:00:00.000Z"),
      2026,
      1,
    );

    expect(message).toContain("записей нет");
    expect(ctx.services.summaryService.generateSummary).not.toHaveBeenCalled();
  });
});
