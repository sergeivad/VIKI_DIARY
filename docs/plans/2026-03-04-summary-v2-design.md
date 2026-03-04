# Summary v2: Better Prompt + Photo Vision

## Problem

Current summary is too long (300-800 words), verbose, and hallucinates details not present in diary entries.

## Design Decisions

- **Format**: Mix of structured facts (emoji bullets) + warm closing text
- **Length**: 200-500 words (down from 300-800)
- **Strictness**: Facts from entries only, minimal connecting narrative OK, no invented details
- **Photo analysis**: Yes, all photos via GPT-4o-mini Vision at summary generation time
- **Progress indicator**: Animated step texts with humorous phrases (client-side timer, no SSE)
- **Rendering**: Plain text with `whitespace-pre-line` (no Markdown parser)

## New Prompt

```
Ты — помощник для детского дневника.
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
- Язык: русский, тёплый но лаконичный
```

## Photo Vision Architecture

At summary generation time (not at upload):

1. Get entries for month (already done)
2. Collect all `fileId`s from entry items with type `PHOTO`
3. Download photos via Telegram Bot API → get file URLs
4. Send photos to GPT-4o-mini with `detail: "low"` and prompt: "Опиши что на фотографии одним предложением на русском"
5. Process all photos in parallel (Promise.all with concurrency limit ~5)
6. Append descriptions to entry text: `[2026-03-12] Мама: Гуляли [Фото: малыш на качелях в парке]`
7. Pass enriched entries to summary generation prompt

**Cost**: ~$0.003-0.005 per photo (low detail). 20-30 photos/month = ~$0.10-0.15 extra.

**Model**: `gpt-4o-mini` for photo descriptions (cheap, fast, sufficient for one-sentence descriptions).

## Progress Indicator

Client-side animated steps with timer-based transitions (no SSE needed):

- Step 1 (~5s): Fun phrases about downloading photos
- Step 2 (~10s): Fun phrases about analyzing photos
- Step 3 (until done): Fun phrases about writing summary

Phrase pools per step (random selection):

**Step 1**: "Разглядываем фоточки..." / "Изучаем шедевры фотоискусства..." / "Листаем альбом..."
**Step 2**: "Вспоминаем, что было..." / "Считаем достижения..." / "Собираем вехи..."
**Step 3**: "Пишем конспект месяца..." / "Подбираем слова..." / "Сочиняем с любовью..."

## Changes Required

### Backend (`src/services/summary.service.ts`)
- New method: `describePhotos(fileIds: string[]): Promise<Map<string, string>>` — calls GPT-4o-mini Vision
- New helper to download Telegram photos via Bot API
- Update `generateSummary` to accept photo descriptions
- Update `SYSTEM_PROMPT` with new prompt text

### Backend (`src/api/routes/summary.routes.ts`)
- Collect photo fileIds from entries
- Call photo description before summary generation
- Format entries with photo descriptions

### Frontend (`miniapp/src/components/summary-screen.tsx`)
- Replace `LoadingAnimation` with multi-step progress component
- Add phrase pools and timer-based step transitions
