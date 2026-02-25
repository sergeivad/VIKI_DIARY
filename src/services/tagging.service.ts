import type OpenAI from "openai";
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
    private readonly openai: OpenAI,
    private readonly log: Logger
  ) {}

  async generateTags(textContent: string): Promise<string[]> {
    try {
      const trimmed = textContent.trim();
      if (!trimmed) {
        return [];
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 256,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const parsed: unknown = JSON.parse(content.trim());
      if (!Array.isArray(parsed)) {
        return [];
      }

      const tags = parsed.filter((item): item is string => typeof item === "string");
      this.log.debug({ tags, input: trimmed.slice(0, 100) }, "Tags generated");
      return tags;
    } catch (error) {
      this.log.warn({ err: error }, "Tag generation failed, returning empty tags");
      return [];
    }
  }
}
