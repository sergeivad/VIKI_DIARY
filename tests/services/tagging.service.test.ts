import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";

import { TaggingService } from "../../src/services/tagging.service.js";

const mockLogger = { warn: vi.fn() } as unknown as Logger;

function createMockAnthropic(
  response: { content: Array<{ type: string; text: string }> } | Error
): Anthropic {
  const create = response instanceof Error
    ? vi.fn().mockRejectedValue(response)
    : vi.fn().mockResolvedValue(response);

  return {
    messages: { create }
  } as unknown as Anthropic;
}

describe("TaggingService", () => {
  it("returns parsed tags from Claude response", async () => {
    const anthropic = createMockAnthropic({
      content: [{ type: "text", text: '["еда", "первый-раз"]' }]
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("Вика попробовала кашу");

    expect(tags).toEqual(["еда", "первый-раз"]);
  });

  it("returns empty array for empty input", async () => {
    const anthropic = createMockAnthropic({
      content: [{ type: "text", text: "[]" }]
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("   ");

    expect(tags).toEqual([]);
  });

  it("returns empty array on API error", async () => {
    const anthropic = createMockAnthropic(new Error("API down"));
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("returns empty array on invalid JSON response", async () => {
    const anthropic = createMockAnthropic({
      content: [{ type: "text", text: "not json" }]
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    const anthropic = createMockAnthropic({
      content: [{ type: "text", text: '{"tags": ["еда"]}' }]
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });

  it("filters out non-string items from array", async () => {
    const anthropic = createMockAnthropic({
      content: [{ type: "text", text: '["еда", 123, null, "сон"]' }]
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual(["еда", "сон"]);
  });

  it("returns empty array when no text block in response", async () => {
    const anthropic = createMockAnthropic({
      content: []
    });
    const service = new TaggingService(anthropic, mockLogger);

    const tags = await service.generateTags("some text");

    expect(tags).toEqual([]);
  });
});
