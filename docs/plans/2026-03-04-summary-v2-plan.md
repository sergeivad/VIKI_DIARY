# Summary v2: Better Prompt + Photo Vision — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve monthly diary summary — shorter structured format, photo analysis via Vision API, fun progress indicator.

**Architecture:** Update `SummaryService` prompt + add `describePhotos()` method using GPT-4o-mini Vision. Route handler collects photo URLs via existing `getFileUrl`, calls vision, enriches entry text before summary generation. Mini App gets animated multi-step loading with humorous phrases.

**Tech Stack:** OpenAI GPT-4o (summary) + GPT-4o-mini Vision (photos), Express, React

---

### Task 1: Update system prompt and max_tokens

**Files:**
- Modify: `src/services/summary.service.ts:15-25` (SYSTEM_PROMPT)
- Modify: `src/services/summary.service.ts:68` (max_tokens)
- Modify: `tests/services/summary.service.test.ts:90` (model assertion still gpt-4o)

**Step 1: Update SYSTEM_PROMPT constant**

In `src/services/summary.service.ts`, replace lines 15-25:

```typescript
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
```

**Step 2: Update max_tokens**

In `src/services/summary.service.ts:68`, change `max_tokens: 1500` to `max_tokens: 1000`.

**Step 3: Run existing tests to verify nothing breaks**

Run: `npm test -- tests/services/summary.service.test.ts`
Expected: All 5 tests PASS (prompt change doesn't affect mock behavior)

**Step 4: Commit**

```bash
git add src/services/summary.service.ts
git commit -m "feat(summary): update prompt to structured format with 200-500 words"
```

---

### Task 2: Add describePhotos method to SummaryService

**Files:**
- Modify: `src/services/summary.service.ts` (add method)
- Modify: `tests/services/summary.service.test.ts` (add tests)

**Step 1: Write failing tests for describePhotos**

Add to `tests/services/summary.service.test.ts`:

```typescript
describe("describePhotos", () => {
  it("returns descriptions mapped by URL", async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn()
            .mockResolvedValueOnce(chatResponse("Малыш на качелях в парке"))
            .mockResolvedValueOnce(chatResponse("Ребёнок ест кашу за столиком"))
        }
      }
    } as unknown as OpenAI;
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhotos([
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg",
    ]);

    expect(result).toEqual(new Map([
      ["https://example.com/photo1.jpg", "Малыш на качелях в парке"],
      ["https://example.com/photo2.jpg", "Ребёнок ест кашу за столиком"],
    ]));

    const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(2);
    // Verify vision model and detail:low
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.messages[0].content[1].image_url.detail).toBe("low");
  });

  it("returns empty map for empty input", async () => {
    const openai = createMockOpenAI(chatResponse("irrelevant"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhotos([]);
    expect(result).toEqual(new Map());
  });

  it("skips failed photo descriptions and logs warning", async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn()
            .mockResolvedValueOnce(chatResponse("Малыш спит"))
            .mockRejectedValueOnce(new Error("API error"))
        }
      }
    } as unknown as OpenAI;
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhotos([
      "https://example.com/ok.jpg",
      "https://example.com/fail.jpg",
    ]);

    expect(result.size).toBe(1);
    expect(result.get("https://example.com/ok.jpg")).toBe("Малыш спит");
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
```

Note: Add `warn` to mockLogger: `const mockLogger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;`

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/services/summary.service.test.ts`
Expected: FAIL — `service.describePhotos is not a function`

**Step 3: Implement describePhotos**

Add to `src/services/summary.service.ts`, inside the class after `generateSummary`:

```typescript
async describePhotos(photoUrls: string[]): Promise<Map<string, string>> {
  if (photoUrls.length === 0) return new Map();

  const results = new Map<string, string>();

  const promises = photoUrls.map(async (url) => {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Опиши что на фотографии одним предложением на русском." },
              { type: "image_url", image_url: { url, detail: "low" } },
            ],
          },
        ],
      });

      const description = response.choices[0]?.message?.content?.trim();
      if (description) {
        results.set(url, description);
      }
    } catch (error) {
      this.log.warn({ url, err: error }, "Failed to describe photo, skipping");
    }
  });

  await Promise.all(promises);
  return results;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/summary.service.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/services/summary.service.ts tests/services/summary.service.test.ts
git commit -m "feat(summary): add describePhotos method using GPT-4o-mini Vision"
```

---

### Task 3: Wire photo descriptions into summary route

**Files:**
- Modify: `src/api/routes/summary.routes.ts` (collect photos, describe, enrich entries)
- Modify: `src/api/router.ts:46-50` (pass `getFileUrl` to summary router)

**Step 1: Update createSummaryRouter signature**

In `src/api/routes/summary.routes.ts`, add `getFileUrl` parameter:

```typescript
export function createSummaryRouter(
  babyService: BabyService,
  diaryService: DiaryService,
  summaryService: SummaryService,
  getFileUrl: (fileId: string) => Promise<string>,
): Router {
```

**Step 2: Update POST handler to collect photo URLs and describe them**

In the POST handler, after `const entries = ...` and before `const entriesText = ...`, add photo collection and description:

```typescript
// Collect photo fileIds from entries
const photoFileIds: { entryIndex: number; fileId: string }[] = [];
entries.forEach((entry, idx) => {
  for (const item of entry.items) {
    if (item.type === "photo" && item.fileId) {
      photoFileIds.push({ entryIndex: idx, fileId: item.fileId });
    }
  }
});

// Get photo URLs and describe them
const photoDescriptions = new Map<string, string>();
if (photoFileIds.length > 0) {
  const urlMap = new Map<string, string>(); // fileId -> url
  const urls = await Promise.all(
    photoFileIds.map(async ({ fileId }) => {
      try {
        const url = await getFileUrl(fileId);
        urlMap.set(fileId, url);
        return url;
      } catch {
        return null;
      }
    })
  );

  const validUrls = urls.filter((u): u is string => u !== null);
  const descriptions = await summaryService.describePhotos(validUrls);

  // Map back from URL to fileId for entry enrichment
  for (const [fileId, url] of urlMap) {
    const desc = descriptions.get(url);
    if (desc) {
      photoDescriptions.set(fileId, desc);
    }
  }
}

// Build enriched entries text
const entriesText = entries.map((entry) => {
  const date = entry.eventDate.toISOString().slice(0, 10);
  const textContent = entry.items
    .map((item) => item.textContent)
    .filter(Boolean)
    .join(" ");

  const photoDescs = entry.items
    .filter((item) => item.type === "photo" && item.fileId && photoDescriptions.has(item.fileId))
    .map((item) => `[Фото: ${photoDescriptions.get(item.fileId!)}]`);

  const parts = [`[${date}] ${entry.author.firstName}: ${textContent}`];
  if (photoDescs.length > 0) {
    parts.push(photoDescs.join(" "));
  }
  return parts.join(" ");
});
```

Remove the old `entriesText` mapping that was there before.

**Step 3: Update router.ts to pass getFileUrl**

In `src/api/router.ts:44-50`, update the summary router creation:

```typescript
router.use(
  "/summary",
  createSummaryRouter(
    services.babyService,
    services.diaryService,
    services.summaryService,
    getFileUrl,
  ),
);
```

Update `createApiRouter` — `getFileUrl` is already a parameter (line 22), just pass it through.

**Step 4: Add the import for EntryItemType if needed for type comparison**

The `item.type` comparison uses string literal `"photo"`. Check that Prisma returns the type as a string. Since we're comparing with `=== "photo"` and Prisma enum values are lowercase strings, this works. No import needed.

Wait — check what the actual Prisma enum values are. They might be uppercase (`PHOTO`) based on the Prisma schema. Let me note: if the enum is uppercase, use `"PHOTO"` instead of `"photo"`.

**Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (route tests may not exist; existing service tests pass)

**Step 6: Commit**

```bash
git add src/api/routes/summary.routes.ts src/api/router.ts
git commit -m "feat(summary): enrich entries with photo descriptions via Vision API"
```

---

### Task 4: Update bot summary handler (keep parity)

**Files:**
- Modify: `src/bot/handlers/summary.ts` (add photo descriptions)

**Step 1: Update generateSummaryMessage to include photo descriptions**

In `src/bot/handlers/summary.ts`, after entries are fetched (line 44) and before entriesText mapping (line 50):

```typescript
import { env } from "../../config/env.js";

// Inside generateSummaryMessage, after entries fetch:
const photoFileIds: { entryIndex: number; fileId: string }[] = [];
entries.forEach((entry, idx) => {
  for (const item of entry.items) {
    if (item.type === "photo" && item.fileId) {
      photoFileIds.push({ entryIndex: idx, fileId: item.fileId });
    }
  }
});

const photoDescriptions = new Map<string, string>();
if (photoFileIds.length > 0) {
  const urlEntries = await Promise.all(
    photoFileIds.map(async ({ fileId }) => {
      try {
        const file = await ctx.api.getFile(fileId);
        if (!file.file_path) return null;
        const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
        return { fileId, url };
      } catch {
        return null;
      }
    })
  );

  const validEntries = urlEntries.filter((e): e is { fileId: string; url: string } => e !== null);
  const descriptions = await ctx.services.summaryService.describePhotos(
    validEntries.map((e) => e.url)
  );

  for (const { fileId, url } of validEntries) {
    const desc = descriptions.get(url);
    if (desc) photoDescriptions.set(fileId, desc);
  }
}

const entriesText = entries.map((entry) => {
  const date = entry.eventDate.toISOString().slice(0, 10);
  const text = getHistoryTextContent(entry.items);

  const photoDescs = entry.items
    .filter((item) => item.type === "photo" && item.fileId && photoDescriptions.has(item.fileId))
    .map((item) => `[Фото: ${photoDescriptions.get(item.fileId!)}]`);

  const parts = [`[${date}] ${text}`];
  if (photoDescs.length > 0) parts.push(photoDescs.join(" "));
  return parts.join(" ");
});
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/bot/handlers/summary.ts
git commit -m "feat(summary): add photo vision to bot summary handler"
```

---

### Task 5: Update Mini App loading animation with multi-step progress

**Files:**
- Modify: `miniapp/src/components/summary-screen.tsx:12-31` (replace LoadingAnimation)

**Step 1: Replace LoadingAnimation component**

Replace the `LoadingAnimation` function (lines 12-31) with:

```tsx
const GENERATION_STEPS = [
  {
    icon: "📷",
    phrases: [
      "Разглядываем фоточки...",
      "Изучаем шедевры фотоискусства...",
      "Листаем альбом...",
    ],
    duration: 5000,
  },
  {
    icon: "🔍",
    phrases: [
      "Вспоминаем, что было...",
      "Считаем достижения...",
      "Собираем вехи...",
    ],
    duration: 10000,
  },
  {
    icon: "✨",
    phrases: [
      "Пишем конспект месяца...",
      "Подбираем слова...",
      "Сочиняем с любовью...",
    ],
    duration: Infinity, // stays until done
  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function LoadingAnimation() {
  const [stepIndex, setStepIndex] = useState(0);
  const [phrase, setPhrase] = useState(() => pickRandom(GENERATION_STEPS[0].phrases));

  useEffect(() => {
    const step = GENERATION_STEPS[stepIndex];
    if (step.duration === Infinity) return;

    const timer = setTimeout(() => {
      const nextIndex = Math.min(stepIndex + 1, GENERATION_STEPS.length - 1);
      setStepIndex(nextIndex);
      setPhrase(pickRandom(GENERATION_STEPS[nextIndex].phrases));
    }, step.duration);

    return () => clearTimeout(timer);
  }, [stepIndex]);

  const step = GENERATION_STEPS[stepIndex];
  const progress = ((stepIndex + 1) / GENERATION_STEPS.length) * 100;

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="text-4xl mb-4">{step.icon}</div>
      <p className="text-sm font-semibold text-foreground mb-1">{phrase}</p>
      <p className="text-xs text-muted-foreground mb-4">
        Шаг {stepIndex + 1} из {GENERATION_STEPS.length}
      </p>
      <div className="w-48 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

Add `useState, useEffect` to the import (already imported on line 1).

**Step 2: Verify in dev**

Run: `cd miniapp && npm run dev`
Navigate to Summary screen, click Generate, observe the 3-step animation.

**Step 3: Commit**

```bash
git add miniapp/src/components/summary-screen.tsx
git commit -m "feat(miniapp): add multi-step progress with fun phrases for summary generation"
```

---

### Task 6: Verify EntryItemType enum values

**Files:**
- Check: `prisma/schema.prisma` for `EntryItemType` enum

**Step 1: Verify enum case**

Check if `EntryItemType` uses `text`, `photo`, `video`, `voice` (lowercase) or `TEXT`, `PHOTO`, `VIDEO`, `VOICE` (uppercase). The string comparisons in Tasks 3 and 4 must match.

If uppercase, update all `item.type === "photo"` to `item.type === "PHOTO"` (or use the re-exported enum from `src/db/client.ts`).

**Step 2: Fix if needed and commit**

---

### Task 7: Smoke test end-to-end

**Step 1: Start backend and frontend**

```bash
npm run db:up
npm run dev &
cd miniapp && npm run dev &
```

**Step 2: Open Mini App, navigate to Summary, generate for a month with photos**

Verify:
- Progress animation shows 3 steps with fun phrases
- Summary is shorter (200-500 words)
- Summary has structured format (emoji bullets, warm closing)
- Photo context appears in summary if photos exist
- No hallucinated details

**Step 3: Test with month without entries**

Verify: "No entries" error shown correctly.

**Step 4: Test regenerate**

Verify: Regenerate button works, shows progress, replaces old summary.
