import type Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";

const FIXED_TAGS = [
  "первый-раз",
  "еда",
  "сон",
  "прогулка",
  "здоровье",
  "игра",
  "развитие",
  "настроение",
  "купание",
  "зубы"
] as const;

const SYSTEM_PROMPT = `Ты — помощник, который расставляет теги для записей в детском дневнике.

Выбери подходящие теги из фиксированного списка:
${FIXED_TAGS.join(", ")}

Также можешь добавить 1-2 свободных тега, если запись не покрывается фиксированными.
Свободные теги — одно-два слова через дефис, строчными буквами, на русском.

Верни JSON-массив строк. Без пояснений, только массив.
Пример: ["еда", "первый-раз", "прикорм"]

Если текст слишком короткий или неинформативный — верни пустой массив: []`;

export class TaggingService {
  constructor(
    private readonly anthropic: Anthropic,
    private readonly log: Logger
  ) {}

  async generateTags(textContent: string): Promise<string[]> {
    try {
      const trimmed = textContent.trim();
      if (!trimmed) {
        return [];
      }

      const response = await this.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: trimmed }]
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return [];
      }

      const parsed: unknown = JSON.parse(textBlock.text);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item): item is string => typeof item === "string");
    } catch (error) {
      this.log.warn({ err: error }, "Tag generation failed, returning empty tags");
      return [];
    }
  }
}
