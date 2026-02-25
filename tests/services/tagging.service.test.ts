import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { Logger } from "pino";

import { TaggingService } from "../../src/services/tagging.service.js";

const mockLogger = { debug: vi.fn(), warn: vi.fn() } as unknown as Logger;

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

describe("TaggingService", () => {
  it("returns parsed tags from OpenAI response", async () => {
    const openai = createMockOpenAI(chatResponse('["еда", "первый-раз"]'));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("Вика попробовала кашу");

    expect(tags).toEqual(["еда", "первый-раз"]);
  });

  it("returns empty array for empty input", async () => {
    const openai = createMockOpenAI(chatResponse("[]"));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("   ");

    expect(tags).toEqual([]);
  });

  it("returns empty array on API error", async () => {
    const openai = createMockOpenAI(new Error("API down"));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("returns empty array on invalid JSON response", async () => {
    const openai = createMockOpenAI(chatResponse("not json"));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    const openai = createMockOpenAI(chatResponse('{"tags": ["еда"]}'));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("filters out non-string items from array", async () => {
    const openai = createMockOpenAI(chatResponse('["еда", 123, null, "сон"]'));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual(["еда", "сон"]);
  });

  it("returns empty array when content is null", async () => {
    const openai = createMockOpenAI(chatResponse(null));
    const service = new TaggingService(openai, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });
});
