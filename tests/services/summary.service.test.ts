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
    expect(call.model).toBe("gpt-4.1");
    expect(call.messages[1].content).toContain("Вика");
    expect(call.messages[1].content).toContain("02.2026");
  });

  describe("describePhoto", () => {
    it("returns description for a valid photo", async () => {
      const openai = createMockOpenAI(chatResponse("Малыш на качелях в парке"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhoto({
        mimeType: "image/jpeg",
        data: Buffer.from("photo-data"),
      });

      expect(result).toBe("Малыш на качелях в парке");

      const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
      const call = create.mock.calls[0][0];
      expect(call.model).toBe("gpt-4o-mini");
      expect(call.max_tokens).toBe(100);
      expect(call.messages[0].content[1].image_url.detail).toBe("low");
    });

    it("returns null on API error", async () => {
      const openai = createMockOpenAI(new Error("API down"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhoto({
        mimeType: "image/jpeg",
        data: Buffer.from("photo-data"),
      });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("returns null for unsupported MIME type", async () => {
      const openai = createMockOpenAI(chatResponse("should not be called"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhoto({
        mimeType: "audio/ogg",
        data: Buffer.from("not-image"),
      });

      expect(result).toBeNull();
      expect(openai.chat.completions.create).not.toHaveBeenCalled();
    });

    it("detects JPEG from buffer when MIME is octet-stream", async () => {
      const openai = createMockOpenAI(chatResponse("Ребёнок в коляске"));
      const service = new SummaryService(mockPrisma, openai, mockLogger);
      const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      const result = await service.describePhoto({
        mimeType: "application/octet-stream",
        data: jpegBytes,
      });

      expect(result).toBe("Ребёнок в коляске");
      const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
      const call = create.mock.calls[0][0];
      expect(call.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("returns null when response content is null", async () => {
      const openai = createMockOpenAI(chatResponse(null));
      const service = new SummaryService(mockPrisma, openai, mockLogger);

      const result = await service.describePhoto({
        mimeType: "image/jpeg",
        data: Buffer.from("data"),
      });

      expect(result).toBeNull();
    });
  });

});
