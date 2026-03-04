import type OpenAI from "openai";
import type { PrismaClient, Summary } from "@prisma/client";
import type { Logger } from "pino";

import { SummaryDomainError, SummaryErrorCode } from "./summary.errors.js";

export type SummaryInput = {
  babyName: string;
  birthDate: Date;
  month: number;
  year: number;
  entriesText: string[];
};

export type SummaryPhotoInput = {
  key: string;
  mimeType: string;
  data: Buffer;
};

const SYSTEM_PROMPT = `Ты — помощник для детского дневника.
Тебе дают записи и описания фотографий за один месяц. Составь конспект месяца.

ФОРМАТ (строго):
1. Заголовок: «{месяц} {год} — {имя}, {возраст}»
2. Блок «Вехи» — буллеты с эмодзи, только конкретные «первые разы» и достижения с датами
3. Блок «Ритмы» — 2-3 буллета про паттерны (сон, еда, прогулки), только если есть данные
4. Тёплая концовка — 2-3 предложения, мягкое обобщение месяца

ПРАВИЛА:
- Каждый факт должен быть подтверждён конкретной записью. НЕ додумывай, НЕ обобщай то, чего нет
- Если в записях упомянуто что-то один раз — пиши как единичное событие, не превращай в паттерн
- Описания фото используй для контекста (место, обстановка), но не выдумывай эмоции по фото
- Длина: 200-500 слов
- Язык: русский, тёплый но лаконичный`;

export class SummaryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly openai: OpenAI,
    private readonly log: Logger
  ) {}

  async getSummary(babyId: string, month: number, year: number): Promise<Summary | null> {
    return this.prisma.summary.findUnique({
      where: { babyId_month_year: { babyId, month, year } },
    });
  }

  async saveSummary(babyId: string, month: number, year: number, text: string): Promise<Summary> {
    return this.prisma.summary.upsert({
      where: { babyId_month_year: { babyId, month, year } },
      update: { text },
      create: { babyId, month, year, text },
    });
  }

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
        max_tokens: 1000,
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

  async describePhotos(photos: SummaryPhotoInput[]): Promise<Map<string, string>> {
    if (photos.length === 0) return new Map();

    const results = new Map<string, string>();

    const promises = photos.map(async (photo) => {
      try {
        const encodedData = photo.data.toString("base64");
        const imageUrl = `data:${photo.mimeType};base64,${encodedData}`;

        const response = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Опиши что на фотографии одним предложением на русском." },
                { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              ],
            },
          ],
        });

        const description = response.choices[0]?.message?.content?.trim();
        if (description) {
          results.set(photo.key, description);
        }
      } catch (error) {
        this.log.warn({ photoKey: photo.key, err: error }, "Failed to describe photo, skipping");
      }
    });

    await Promise.all(promises);
    return results;
  }
}
