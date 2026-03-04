import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  env: {
    BOT_TOKEN: "test-bot-token",
  },
}));

import { generateSummaryMessage } from "../../src/bot/handlers/summary.js";

function buildCtx(entries: Array<Record<string, unknown>>) {
  return {
    api: {
      getFile: vi.fn().mockResolvedValue({ file_path: "photos/tg-photo-1.jpg" }),
    },
    services: {
      diaryService: {
        getEntriesForDateRange: vi.fn().mockResolvedValue(entries),
      },
      summaryService: {
        describePhotos: vi.fn(),
        generateSummary: vi.fn().mockResolvedValue("Итог месяца"),
      },
      s3Service: {
        getObjectData: vi.fn().mockResolvedValue({
          data: Buffer.from("s3-image-data"),
          mimeType: "image/png",
        }),
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("generateSummaryMessage", () => {
  it("passes Telegram and S3 photos as binary vision inputs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from("telegram-photo"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ctx = buildCtx([
      {
        eventDate: new Date("2026-01-06T00:00:00.000Z"),
        items: [
          { type: "text", textContent: "Прогулка" },
          { type: "photo", fileId: "tg-photo-1", s3Key: null, textContent: null },
          {
            type: "photo",
            fileId: null,
            s3Key: "uploads/u/s3-photo-1.jpg",
            textContent: null,
          },
        ],
      },
    ]);

    ctx.services.summaryService.describePhotos.mockResolvedValue(
      new Map([
        ["file:tg-photo-1", "Ребенок на улице"],
        ["s3:uploads/u/s3-photo-1.jpg", "Ребенок на коврике дома"],
      ]),
    );

    const message = await generateSummaryMessage(
      ctx as never,
      "user-1",
      "baby-1",
      "Вика",
      new Date("2025-06-15T00:00:00.000Z"),
      2026,
      1,
    );

    expect(ctx.services.summaryService.describePhotos).toHaveBeenCalledWith([
      {
        key: "file:tg-photo-1",
        mimeType: "image/jpeg",
        data: expect.any(Buffer),
      },
      {
        key: "s3:uploads/u/s3-photo-1.jpg",
        mimeType: "image/png",
        data: expect.any(Buffer),
      },
    ]);

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

  it("does not forward telegram bot token URLs to describePhotos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from("telegram-photo"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ctx = buildCtx([
      {
        eventDate: new Date("2026-01-07T00:00:00.000Z"),
        items: [{ type: "photo", fileId: "tg-photo-2", s3Key: null, textContent: null }],
      },
    ]);
    ctx.api.getFile = vi.fn().mockResolvedValue({ file_path: "photos/secret-token.jpg" });
    ctx.services.summaryService.describePhotos.mockResolvedValue(new Map());

    await generateSummaryMessage(
      ctx as never,
      "user-1",
      "baby-1",
      "Вика",
      new Date("2025-06-15T00:00:00.000Z"),
      2026,
      1,
    );

    const visionInput = ctx.services.summaryService.describePhotos.mock.calls[0][0];
    const serialized = JSON.stringify(visionInput);

    expect(serialized).not.toContain("https://api.telegram.org/file/bot");
    expect(serialized).not.toContain("BOT_TOKEN");
  });
});
