import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

import { TranscriptionService } from "../../src/services/transcription.service.js";
import { TranscriptionErrorCode } from "../../src/services/transcription.errors.js";

function createMockOpenAI(
  transcribeResult: { text: string } | Error,
  postProcessResult?: { choices: Array<{ message: { content: string | null } }> } | Error
): OpenAI {
  const transcribeCreate = transcribeResult instanceof Error
    ? vi.fn().mockRejectedValue(transcribeResult)
    : vi.fn().mockResolvedValue(transcribeResult);

  const chatCreate = postProcessResult
    ? postProcessResult instanceof Error
      ? vi.fn().mockRejectedValue(postProcessResult)
      : vi.fn().mockResolvedValue(postProcessResult)
    : vi.fn().mockResolvedValue({
        choices: [{ message: { content: null } }]
      });

  return {
    audio: {
      transcriptions: { create: transcribeCreate }
    },
    chat: {
      completions: { create: chatCreate }
    }
  } as unknown as OpenAI;
}

function chatResponse(content: string | null) {
  return { choices: [{ message: { content } }] };
}

describe("TranscriptionService", () => {
  it("returns post-processed transcribed text on success", async () => {
    const openai = createMockOpenAI(
      { text: "вика сегодня гуляла в парке было хорошо" },
      chatResponse("Вика сегодня гуляла в парке. Было хорошо.")
    );
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg");

    expect(result).toBe("Вика сегодня гуляла в парке. Было хорошо.");
  });

  it("returns raw text when post-processing fails", async () => {
    const openai = createMockOpenAI(
      { text: "вика сегодня гуляла" },
      new Error("API down")
    );
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg");

    expect(result).toBe("вика сегодня гуляла");
  });

  it("returns raw text when post-processing returns null", async () => {
    const openai = createMockOpenAI(
      { text: "вика сегодня гуляла" },
      chatResponse(null)
    );
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg");

    expect(result).toBe("вика сегодня гуляла");
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
    const openai = createMockOpenAI(
      { text: "ok" },
      chatResponse("Ok.")
    );
    const service = new TranscriptionService(openai);

    const result = await service.transcribe(Buffer.from("audio"), "voice.ogg", 300);
    expect(result).toBe("Ok.");
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
