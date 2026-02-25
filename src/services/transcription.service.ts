import type OpenAI from "openai";
import { toFile } from "openai";

import { TranscriptionError, TranscriptionErrorCode } from "./transcription.errors.js";

const MAX_DURATION_SECONDS = 300;

const POST_PROCESS_PROMPT = `Ты получаешь сырой текст транскрипции голосового сообщения на русском языке.
Твоя задача — отформатировать его:
- Расставь пунктуацию и заглавные буквы
- Разбей на предложения
- Исправь очевидные ошибки распознавания
- Не меняй смысл и содержание
- Верни только отформатированный текст, без пояснений`;

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

      return this.postProcess(text);
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

  private async postProcess(rawText: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: POST_PROCESS_PROMPT },
          { role: "user", content: rawText }
        ]
      });

      const content = response.choices[0]?.message?.content?.trim();
      return content || rawText;
    } catch {
      return rawText;
    }
  }
}
