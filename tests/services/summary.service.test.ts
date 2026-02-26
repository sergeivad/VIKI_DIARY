import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { Logger } from "pino";

import { SummaryService } from "../../src/services/summary.service.js";
import { SummaryErrorCode } from "../../src/services/summary.errors.js";

const mockLogger = { debug: vi.fn(), error: vi.fn() } as unknown as Logger;

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
    const service = new SummaryService(openai, mockLogger);

    const result = await service.generateSummary({
      ...baseInput,
      entriesText: ["[2026-02-01] Гуляли в парке"]
    });

    expect(result).toBe(summaryText);
  });

  it("throws noEntries when entriesText is empty", async () => {
    const openai = createMockOpenAI(chatResponse("irrelevant"));
    const service = new SummaryService(openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: [] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.noEntries });
  });

  it("throws generationFailed when response content is null", async () => {
    const openai = createMockOpenAI(chatResponse(null));
    const service = new SummaryService(openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: ["text"] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.generationFailed });
  });

  it("throws generationFailed on API error", async () => {
    const openai = createMockOpenAI(new Error("API down"));
    const service = new SummaryService(openai, mockLogger);

    await expect(
      service.generateSummary({ ...baseInput, entriesText: ["text"] })
    ).rejects.toMatchObject({ code: SummaryErrorCode.generationFailed });
  });

  it("passes correct model and includes baby name in user message", async () => {
    const openai = createMockOpenAI(chatResponse("Summary"));
    const service = new SummaryService(openai, mockLogger);

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
});
