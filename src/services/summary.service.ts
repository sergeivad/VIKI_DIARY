import type OpenAI from "openai";
import type { Logger } from "pino";

import { SummaryDomainError, SummaryErrorCode } from "./summary.errors.js";

export type SummaryInput = {
  babyName: string;
  birthDate: Date;
  month: number;
  year: number;
  entriesText: string[];
};

const SYSTEM_PROMPT = `Ты — помощник для родителей, пишущих детский дневник.
Тебе дают дневниковые записи за один месяц. Составь тёплый, родительский конспект месяца на русском языке.

Правила:
- Пиши от лица наблюдателя, обращайся к малышу по имени
- Выдели ключевые вехи и «первые разы»
- Отметь паттерны: сон, еда, прогулки, настроение
- Упомяни яркие эмоциональные моменты
- Не выдумывай то, чего нет в записях
- Формат: связный текст с абзацами, без заголовков и списков
- Длина: 300–800 слов`;

export class SummaryService {
  constructor(
    private readonly openai: OpenAI,
    private readonly log: Logger
  ) {}

  async generateSummary(input: SummaryInput): Promise<string> {
    if (input.entriesText.length === 0) {
      throw new SummaryDomainError(SummaryErrorCode.noEntries, "No entries for the given period");
    }

    const ageMonths = (input.year - input.birthDate.getUTCFullYear()) * 12
      + (input.month - (input.birthDate.getUTCMonth() + 1));

    const userMessage = [
      `Малыш: ${input.babyName}`,
      `Возраст: ~${ageMonths} мес.`,
      `Период: ${String(input.month).padStart(2, "0")}.${input.year}`,
      "",
      "Записи:",
      ...input.entriesText
    ].join("\n");

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new SummaryDomainError(SummaryErrorCode.generationFailed, "Empty response from LLM");
      }

      this.log.debug(
        { month: input.month, year: input.year, entriesCount: input.entriesText.length },
        "Summary generated"
      );

      return content.trim();
    } catch (error) {
      if (error instanceof SummaryDomainError) {
        throw error;
      }

      this.log.error({ err: error }, "Summary generation failed");
      throw new SummaryDomainError(SummaryErrorCode.generationFailed, "Failed to generate summary");
    }
  }
}
