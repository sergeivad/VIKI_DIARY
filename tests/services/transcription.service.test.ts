import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

import { TranscriptionService } from "../../src/services/transcription.service.js";
import { TranscriptionErrorCode } from "../../src/services/transcription.errors.js";

function createMockOpenAI(transcribeResult: { text: string } | Error): OpenAI {
  const create = transcribeResult instanceof Error
    ? vi.fn().mockRejectedValue(transcribeResult)
    : vi.fn().mockResolvedValue(transcribeResult);

  return {
    audio: {
      transcriptions: { create }
    }
  } as unknown as OpenAI;
}

describe("TranscriptionService", () => {
  it("returns transcribed text on success", async () => {
    const openai = createMockOpenAI({ text: "Вика сегодня гуляла" });
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg");

    expect(result).toBe("Вика сегодня гуляла");
  });

  it("throws DURATION_TOO_LONG when duration exceeds limit", async () => {
    const openai = createMockOpenAI({ text: "" });
    const service = new TranscriptionService(openai);

    await expect(
      service.transcribe(Buffer.from("audio"), "voice.ogg", 301)
    ).rejects.toMatchObject({
      name: "TranscriptionError",
      code: TranscriptionErrorCode.durationTooLong
    });
  });

  it("allows exactly 300 seconds", async () => {
    const openai = createMockOpenAI({ text: "ok" });
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg", 300);
    expect(result).toBe("ok");
  });

  it("throws TRANSCRIPTION_FAILED on empty result", async () => {
    const openai = createMockOpenAI({ text: "   " });
    const service = new TranscriptionService(openai);

    await expect(
      service.transcribe(Buffer.from("audio"), "voice.ogg")
    ).rejects.toMatchObject({
      name: "TranscriptionError",
      code: TranscriptionErrorCode.transcriptionFailed
    });
  });

  it("throws TRANSCRIPTION_FAILED on API error", async () => {
    const openai = createMockOpenAI(new Error("API down"));
    const service = new TranscriptionService(openai);

    await expect(
      service.transcribe(Buffer.from("audio"), "voice.ogg")
    ).rejects.toMatchObject({
      name: "TranscriptionError",
      code: TranscriptionErrorCode.transcriptionFailed
    });
  });
});
