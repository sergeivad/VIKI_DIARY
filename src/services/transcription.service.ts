import type OpenAI from "openai";
import { toFile } from "openai";

import { TranscriptionError, TranscriptionErrorCode } from "./transcription.errors.js";

const MAX_DURATION_SECONDS = 300;

export class TranscriptionService {
  constructor(private readonly openai: OpenAI) {}

  async transcribe(fileBuffer: Buffer, filename: string, durationSeconds?: number): Promise<string> {
    if (durationSeconds !== undefined && durationSeconds > MAX_DURATION_SECONDS) {
      throw new TranscriptionError(
        TranscriptionErrorCode.durationTooLong,
        `Voice message too long: ${durationSeconds}s (max ${MAX_DURATION_SECONDS}s)`
      );
    }

    try {
      const file = await toFile(fileBuffer, filename);
      const response = await this.openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        language: "ru"
      });

      const text = response.text?.trim();
      if (!text) {
        throw new TranscriptionError(
          TranscriptionErrorCode.transcriptionFailed,
          "Transcription returned empty result"
        );
      }

      return text;
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }

      throw new TranscriptionError(
        TranscriptionErrorCode.transcriptionFailed,
        `Transcription failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }
}
