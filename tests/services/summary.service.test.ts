import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { Logger } from "pino";

import { SummaryService } from "../../src/services/summary.service.js";
import { SummaryErrorCode } from "../../src/services/summary.errors.js";

import type { PrismaClient } from "@prisma/client";

const mockLogger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
const mockPrisma = {} as unknown as PrismaClient;

function createMockOpenAI(
  response: { choices: Array<{ message: { content: string | null } }> } | Error
): OpenAI {
  const create = response instanceof Error
    ? vi.fn().mockRejectedValue(response)
    : vi.fn().mockResolvedValue(response);

  return {
    chat: {
      completions: { create }
    }
  } as unknown as OpenAI;
}

function chatResponse(content: string | null) {
  return { choices: [{ message: { content } }] };
}

const baseInput = {
  babyName: "Вика",
  birthDate: new Date("2025-06-15T00:00:00.000Z"),
  month: 2,
  year: 2026
};

describe("SummaryService", () => {
  it("returns generated summary text", async () => {
    const summaryText = "Вика в феврале много гуляла...";
    const openai = createMockOpenAI(chatResponse(summaryText));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.generateSummary({
      ...baseInput,
      entriesText: ["[2026-02-01] Гуляли в парке"]
    });

    expect(result).toBe(summaryText);
  });

  it("throws noEntries when entriesText is empty", async () => {
    const openai = createMockOpenAI(chatResponse("irrelevant"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: [] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.noEntries });
  });

  it("throws generationFailed when response content is null", async () => {
    const openai = createMockOpenAI(chatResponse(null));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: ["text"] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.generationFailed });
  });

  it("throws generationFailed on API error", async () => {
    const openai = createMockOpenAI(new Error("API down"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: ["text"] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.generationFailed });
  });

  it("passes correct model and includes baby name in user message", async () => {
    const openai = createMockOpenAI(chatResponse("Summary"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    await service.generateSummary({
      ...baseInput,
      entriesText: ["[2026-02-01] Гуляли"]
    });

    const create = (openai.chat.completions.create as ReturnType<typeof vi.fn>);
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o");
    expect(call.messages[1].content).toContain("Вика");
    expect(call.messages[1].content).toContain("02.2026");
  });

  describe("describePhotos", () => {
    it("returns descriptions mapped by key", async () => {
      const openai = {
        chat: {
          completions: {
            create: vi.fn()
              .mockResolvedValueOnce(chatResponse("Малыш на качелях в парке"))
              .mockResolvedValueOnce(chatResponse("Ребёнок ест кашу за столиком"))
          }
        }
      } as unknown as OpenAI;
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhotos([
        { key: "photo-1", mimeType: "image/jpeg", data: Buffer.from("photo-1-data") },
        { key: "photo-2", mimeType: "image/png", data: Buffer.from("photo-2-data") },
      ]);

      expect(result).toEqual(new Map([
        ["photo-1", "Малыш на качелях в парке"],
        ["photo-2", "Ребёнок ест кашу за столиком"],
      ]));

      const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
      expect(create).toHaveBeenCalledTimes(2);
      // Verify vision model and detail:low
      const call = create.mock.calls[0][0];
      expect(call.model).toBe("gpt-4o-mini");
      expect(call.messages[0].content[1].image_url.detail).toBe("low");
      expect(call.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("returns empty map for empty input", async () => {
      const openai = createMockOpenAI(chatResponse("irrelevant"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhotos([]);
      expect(result).toEqual(new Map());
    });

    it("skips failed photo descriptions and logs warning", async () => {
      const openai = {
        chat: {
          completions: {
            create: vi.fn()
              .mockResolvedValueOnce(chatResponse("Малыш спит"))
              .mockRejectedValueOnce(new Error("API error"))
          }
        }
      } as unknown as OpenAI;
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhotos([
        { key: "ok", mimeType: "image/jpeg", data: Buffer.from("ok-data") },
        { key: "fail", mimeType: "image/jpeg", data: Buffer.from("fail-data") },
      ]);

      expect(result.size).toBe(1);
      expect(result.get("ok")).toBe("Малыш спит");
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("normalizes octet-stream image to image/jpeg data url", async () => {
      const openai = createMockOpenAI(chatResponse("Ребенок в коляске"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);
      const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

      const result = await service.describePhotos([
        { key: "photo-octet", mimeType: "application/octet-stream", data: jpegBytes },
      ]);

      expect(result.get("photo-octet")).toBe("Ребенок в коляске");

      const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
      const call = create.mock.calls[0][0];
      expect(call.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("skips non-image mime types before calling OpenAI", async () => {
      const openai = createMockOpenAI(chatResponse("should-not-be-used"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhotos([
        { key: "audio", mimeType: "audio/ogg", data: Buffer.from("not-image") },
      ]);

      expect(result.size).toBe(0);
      expect(openai.chat.completions.create).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
