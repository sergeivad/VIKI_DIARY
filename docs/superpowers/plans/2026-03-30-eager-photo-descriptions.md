# Eager Photo Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move photo Vision API calls from summary-time to upload-time, storing descriptions in the database for instant retrieval during summary generation.

**Architecture:** Add `description` field to `EntryItem`. On photo upload (bot or Mini App), fire-and-forget a GPT-4o-mini Vision call and persist the result. Summary generation reads stored descriptions instead of calling Vision API. A backfill script handles existing photos.

**Tech Stack:** Prisma 7, OpenAI GPT-4o-mini Vision, Node.js 22 ESM, Vitest

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma:81-97`

- [ ] **Step 1: Add `description` field to EntryItem model**

In `prisma/schema.prisma`, add `description` after `thumbnailS3Key`:

```prisma
model EntryItem {
  id              String        @id @default(uuid()) @db.Uuid
  entryId         String        @map("entry_id") @db.Uuid
  type            EntryItemType
  textContent     String?       @map("text_content")
  fileId          String?       @map("file_id")
  thumbnailFileId String?       @map("thumbnail_file_id")
  s3Key           String?       @map("s3_key")
  thumbnailS3Key  String?       @map("thumbnail_s3_key")
  description     String?
  orderIndex      Int           @map("order_index")
  createdAt       DateTime      @default(now()) @map("created_at")

  entry           DiaryEntry    @relation(fields: [entryId], references: [id], onDelete: Cascade)

  @@index([entryId, orderIndex])
  @@map("entry_items")
}
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
npm run prisma:migrate:dev -- --name add-entry-item-description
```

Expected: Migration created, Prisma client regenerated. New column `description` added to `entry_items` table.

- [ ] **Step 3: Regenerate Prisma client**

Run:
```bash
npm run prisma:generate
```

Expected: `@prisma/client` regenerated with `description` field on `EntryItem`.

- [ ] **Step 4: Verify build compiles**

Run:
```bash
npm run build
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add description field to EntryItem schema"
```

---

### Task 2: New `describePhoto` Method in SummaryService

**Files:**
- Modify: `src/services/summary.service.ts`
- Modify: `tests/services/summary.service.test.ts`

- [ ] **Step 1: Write tests for `describePhoto`**

Add to `tests/services/summary.service.test.ts`:

```typescript
describe("describePhoto", () => {
  it("returns description for a valid photo", async () => {
    const openai = createMockOpenAI(chatResponse("Малыш на качелях в парке"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhoto({
      mimeType: "image/jpeg",
      data: Buffer.from("photo-data"),
    });

    expect(result).toBe("Малыш на качелях в парке");

    const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.max_tokens).toBe(100);
    expect(call.messages[0].content[1].image_url.detail).toBe("low");
  });

  it("returns null on API error", async () => {
    const openai = createMockOpenAI(new Error("API down"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhoto({
      mimeType: "image/jpeg",
      data: Buffer.from("photo-data"),
    });

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("returns null for unsupported MIME type", async () => {
    const openai = createMockOpenAI(chatResponse("should not be called"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhoto({
      mimeType: "audio/ogg",
      data: Buffer.from("not-image"),
    });

    expect(result).toBeNull();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("detects JPEG from buffer when MIME is octet-stream", async () => {
    const openai = createMockOpenAI(chatResponse("Ребёнок в коляске"));
    const service = new SummaryService(mockPrisma, openai, mockLogger);
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const result = await service.describePhoto({
      mimeType: "application/octet-stream",
      data: jpegBytes,
    });

    expect(result).toBe("Ребёнок в коляске");
    const create = openai.chat.completions.create as ReturnType<typeof vi.fn>;
    const call = create.mock.calls[0][0];
    expect(call.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns null when response content is null", async () => {
    const openai = createMockOpenAI(chatResponse(null));
    const service = new SummaryService(mockPrisma, openai, mockLogger);

    const result = await service.describePhoto({
      mimeType: "image/jpeg",
      data: Buffer.from("data"),
    });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- tests/services/summary.service.test.ts -t "describePhoto"
```

Expected: FAIL — `service.describePhoto is not a function`.

- [ ] **Step 3: Implement `describePhoto` in SummaryService**

In `src/services/summary.service.ts`, add new type and method. Replace `SummaryPhotoInput` export:

```typescript
export type PhotoDescriptionInput = {
  mimeType: string;
  data: Buffer;
};
```

Add method to `SummaryService` class:

```typescript
async describePhoto(photo: PhotoDescriptionInput): Promise<string | null> {
  try {
    const resolvedMimeType = resolveVisionImageMimeType(photo);
    if (!resolvedMimeType) {
      this.log.warn({ mimeType: photo.mimeType }, "Skipping photo with unsupported MIME type");
      return null;
    }

    const encodedData = photo.data.toString("base64");
    const imageUrl = `data:${resolvedMimeType};base64,${encodedData}`;

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

    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    this.log.warn({ err: error }, "Failed to describe photo");
    return null;
  }
}
```

Note: `resolveVisionImageMimeType` accepts `{ mimeType: string; data: Buffer }` which matches both old `SummaryPhotoInput` and new `PhotoDescriptionInput`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- tests/services/summary.service.test.ts -t "describePhoto"
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/summary.service.ts tests/services/summary.service.test.ts
git commit -m "feat: add describePhoto method for single photo descriptions"
```

---

### Task 3: Add `updateItemDescription` to DiaryService

**Files:**
- Modify: `src/services/diary.service.ts`
- Modify: `tests/services/diary.service.test.ts`

- [ ] **Step 1: Write test for `updateItemDescription`**

Add to `tests/services/diary.service.test.ts`:

```typescript
describe("updateItemDescription", () => {
  it("updates the description field of an entry item", async () => {
    mockPrisma.entryItem.update = vi.fn().mockResolvedValue({ id: "item-1", description: "Малыш в парке" });

    await service.updateItemDescription("item-1", "Малыш в парке");

    expect(mockPrisma.entryItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { description: "Малыш в парке" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm test -- tests/services/diary.service.test.ts -t "updateItemDescription"
```

Expected: FAIL — `service.updateItemDescription is not a function`.

- [ ] **Step 3: Implement `updateItemDescription`**

Add to `DiaryService` class in `src/services/diary.service.ts`:

```typescript
async updateItemDescription(itemId: string, description: string): Promise<void> {
  await this.prisma.entryItem.update({
    where: { id: itemId },
    data: { description },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm test -- tests/services/diary.service.test.ts -t "updateItemDescription"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/diary.service.ts tests/services/diary.service.test.ts
git commit -m "feat: add updateItemDescription to DiaryService"
```

---

### Task 4: Fire-and-Forget Photo Description in Bot Handlers

**Files:**
- Modify: `src/bot/middleware/mediaGroup.ts`
- Modify: `src/bot/handlers/diary.ts`

- [ ] **Step 1: Create helper function in `mediaGroup.ts`**

Add after the existing `generateAndApplyTags` function in `src/bot/middleware/mediaGroup.ts`:

```typescript
import { downloadTelegramFileWithMeta } from "../../utils/telegram.js";
import { env } from "../../config/env.js";
```

```typescript
function describeAndSavePhotos(ctx: BotContext, items: EntryItem[]): void {
  const photoItems = items.filter((item) => item.type === "photo" && item.fileId && !item.description);
  if (photoItems.length === 0) return;

  void (async () => {
    for (const item of photoItems) {
      try {
        const file = await downloadTelegramFileWithMeta(ctx.api, env.BOT_TOKEN, item.fileId!);
        const description = await ctx.services.summaryService.describePhoto({
          mimeType: file.mimeType,
          data: file.data,
        });
        if (description) {
          await ctx.services.diaryService.updateItemDescription(item.id, description);
        }
      } catch {
        // Fire-and-forget: never throw
      }
    }
  })();
}
```

- [ ] **Step 2: Call `describeAndSavePhotos` after entry creation in `flushGroup`**

In `src/bot/middleware/mediaGroup.ts`, in the `flushGroup` function, add the call right after `generateAndApplyTags` (line 137):

```typescript
        generateAndApplyTags(buffered.ctx, result.entry);
        describeAndSavePhotos(buffered.ctx, result.entry.items);
        return;
      }

      await buffered.ctx.reply(formatIngestAck(result));
      generateAndApplyTags(buffered.ctx, result.entry);
      describeAndSavePhotos(buffered.ctx, result.entry.items);
```

Call it in BOTH the `created` and `appended` branches — new photos may be appended too.

- [ ] **Step 3: Add the same helper to `diary.ts` and call it for single photos**

In `src/bot/handlers/diary.ts`, add the same imports and helper function:

```typescript
import { downloadTelegramFileWithMeta } from "../../utils/telegram.js";
```

```typescript
function describeAndSavePhotos(ctx: BotContext, items: EntryItem[]): void {
  const photoItems = items.filter((item) => item.type === "photo" && item.fileId && !item.description);
  if (photoItems.length === 0) return;

  void (async () => {
    for (const item of photoItems) {
      try {
        const file = await downloadTelegramFileWithMeta(ctx.api, env.BOT_TOKEN, item.fileId!);
        const description = await ctx.services.summaryService.describePhoto({
          mimeType: file.mimeType,
          data: file.data,
        });
        if (description) {
          await ctx.services.diaryService.updateItemDescription(item.id, description);
        }
      } catch {
        // Fire-and-forget
      }
    }
  })();
}
```

In `handleDiaryMessage`, after the single photo/video block (after line 278 `generateAndApplyTags`), add:

```typescript
  generateAndApplyTags(ctx, result.entry);
  describeAndSavePhotos(ctx, result.entry.items);
```

- [ ] **Step 4: Verify build compiles**

Run:
```bash
npm run build
```

Expected: No errors.

- [ ] **Step 5: Run existing bot tests to ensure no regressions**

Run:
```bash
npm test -- tests/bot/media-group.middleware.test.ts tests/bot/diary.handler.test.ts
```

Expected: All existing tests PASS. (Fire-and-forget calls won't affect existing tests since they don't await.)

- [ ] **Step 6: Commit**

```bash
git add src/bot/middleware/mediaGroup.ts src/bot/handlers/diary.ts
git commit -m "feat: fire-and-forget photo descriptions in bot handlers"
```

---

### Task 5: Fire-and-Forget Photo Description in REST API

**Files:**
- Modify: `src/api/routes/entries.routes.ts`
- Modify: `src/api/router.ts`

- [ ] **Step 1: Update `createEntriesRouter` signature**

In `src/api/routes/entries.routes.ts`, update the function signature to accept additional services:

```typescript
import type { SummaryService } from "../../services/summary.service.js";
import type { S3Service } from "../../services/s3.service.js";
```

```typescript
export function createEntriesRouter(
  diaryService: DiaryService,
  taggingService: TaggingService,
  summaryService: SummaryService,
  s3Service: S3Service | null,
): Router {
```

- [ ] **Step 2: Add fire-and-forget photo description helper inside the router**

Add inside `createEntriesRouter`, before the route definitions:

```typescript
  function describeAndSaveS3Photos(
    entry: { items: Array<{ id: string; type: string; s3Key: string | null; description: string | null }> },
  ): void {
    const photoItems = entry.items.filter(
      (item) => item.type === "photo" && item.s3Key && !item.description,
    );
    if (photoItems.length === 0 || !s3Service) return;

    void (async () => {
      for (const item of photoItems) {
        try {
          const s3Photo = await s3Service.getObjectData(item.s3Key!);
          const description = await summaryService.describePhoto({
            mimeType: s3Photo.mimeType ?? "image/jpeg",
            data: s3Photo.data,
          });
          if (description) {
            await diaryService.updateItemDescription(item.id, description);
          }
        } catch (err) {
          logger.error({ err, itemId: item.id }, "Fire-and-forget photo description failed");
        }
      }
    })();
  }
```

- [ ] **Step 3: Call it in POST `/` (create entry) and POST `/:id/media` (add media)**

In the `POST /` handler, after the tagging block (after line 114), add:

```typescript
      describeAndSaveS3Photos(entry);
```

In the `POST /:id/media` handler, after the response (after line 221 `res.status(201).json(entry)`), add:

```typescript
      describeAndSaveS3Photos(entry);
```

- [ ] **Step 4: Update `createApiRouter` to pass new dependencies**

In `src/api/router.ts`, update the entries router call (line 43-45):

```typescript
  router.use(
    "/entries",
    createEntriesRouter(
      services.diaryService,
      services.taggingService,
      services.summaryService,
      services.s3Service,
    ),
  );
```

- [ ] **Step 5: Verify build compiles**

Run:
```bash
npm run build
```

Expected: No errors.

- [ ] **Step 6: Run existing entries route tests**

Run:
```bash
npm test -- tests/api/routes/entries.routes.test.ts
```

Expected: All pass. May need to update the test's `createEntriesRouter` call to pass mock `summaryService` and `s3Service`. If test fails, add minimal mocks:

```typescript
const mockSummaryService = { describePhoto: vi.fn() } as unknown as SummaryService;
const mockS3Service = null;
```

And update the router creation call in the test.

- [ ] **Step 7: Commit**

```bash
git add src/api/routes/entries.routes.ts src/api/router.ts tests/api/routes/entries.routes.test.ts
git commit -m "feat: fire-and-forget photo descriptions in REST API entries"
```

---

### Task 6: Simplify Summary Generation (Remove Photo Download/Describe)

**Files:**
- Modify: `src/api/routes/summary.routes.ts`
- Modify: `src/bot/handlers/summary.ts`
- Modify: `src/api/router.ts`
- Modify: `tests/api/routes/summary.routes.test.ts`
- Modify: `tests/bot/summary.handler.test.ts`

- [ ] **Step 1: Rewrite summary route — remove photo download/describe logic**

Replace the `POST /` handler body in `src/api/routes/summary.routes.ts`. The entire photo download section (lines 98-144) and enrichment (lines 147-174) are replaced:

```typescript
export function createSummaryRouter(
  babyService: BabyService,
  diaryService: DiaryService,
  summaryService: SummaryService,
): Router {
```

Remove `getTelegramPhotoData` and `s3Service` params entirely. Remove unused imports: `SummaryPhotoInput`, `S3Service`, `GetTelegramPhotoData`.

Replace the POST handler's entry processing (after fetching `entries`) with:

```typescript
      const entriesText = entries.map((entry) => {
        const date = entry.eventDate.toISOString().slice(0, 10);
        const textContent = entry.items
          .map((item) => item.textContent)
          .filter(Boolean)
          .join(" ");

        const photoDescs = entry.items
          .filter((item) => item.type === "photo" && item.description)
          .map((item) => `[Фото: ${item.description}]`);

        const parts = [
          `[${date}] ${entry.author.firstName}: ${textContent}`,
        ];
        if (photoDescs.length > 0) {
          parts.push(photoDescs.join(" "));
        }
        return parts.join(" ");
      });
```

Remove the helper functions `getPhotoKey`, `getItemS3Key` from the file (no longer needed).

- [ ] **Step 2: Update `createApiRouter` to remove `getTelegramPhotoData` and `s3Service` from summary router**

In `src/api/router.ts`, update the summary router call:

```typescript
  router.use(
    "/summary",
    createSummaryRouter(
      services.babyService,
      services.diaryService,
      services.summaryService,
    ),
  );
```

Remove `GetTelegramPhotoData` type and the `getTelegramPhotoData` parameter from `createApiRouter`. Remove it from `src/index.ts` as well — the `getTelegramPhotoData` const (lines 78-84) and the parameter in the `createApiRouter` call (line 86).

Updated `createApiRouter` signature:

```typescript
export function createApiRouter(
  services: ApiServices,
  botToken: string,
  getFileUrl: GetFileUrl,
): Router {
```

In `src/index.ts`, remove the `getTelegramPhotoData` function and update the call:

```typescript
const apiRouter = createApiRouter(services, env.BOT_TOKEN, getFileUrl);
```

- [ ] **Step 3: Rewrite bot summary handler — remove photo download/describe logic**

In `src/bot/handlers/summary.ts`, replace `generateSummaryMessage` to read descriptions from items instead of downloading photos:

Remove imports: `SummaryPhotoInput`, `downloadTelegramFileWithMeta`, `env`.
Remove helper functions: `getPhotoKey`, `getItemS3Key`.

Replace the function body (after fetching `entries`):

```typescript
export async function generateSummaryMessage(
  ctx: BotContext,
  actorId: string,
  babyId: string,
  babyName: string,
  birthDate: Date,
  year: number,
  month: number
): Promise<string> {
  const { dateFrom, dateTo } = getMonthDateRange(year, month);

  const entries = await ctx.services.diaryService.getEntriesForDateRange({
    babyId,
    actorId,
    dateFrom,
    dateTo
  });

  if (entries.length === 0) {
    return `В ${formatRuMonth(year, month)} записей нет.`;
  }

  const entriesText = entries.map((entry) => {
    const date = entry.eventDate.toISOString().slice(0, 10);
    const text = getHistoryTextContent(entry.items);

    const photoDescs = entry.items
      .filter((item) => item.type === "photo" && item.description)
      .map((item) => `[Фото: ${item.description}]`);

    const parts = [`[${date}] ${text}`];
    if (photoDescs.length > 0) parts.push(photoDescs.join(" "));
    return parts.join(" ");
  });

  const summary = await ctx.services.summaryService.generateSummary({
    babyName,
    birthDate,
    month,
    year,
    entriesText
  });

  const header = `📋 Конспект за ${formatRuMonth(year, month)}`;
  return `${header}\n\n${summary}`;
}
```

- [ ] **Step 4: Update summary route tests**

In `tests/api/routes/summary.routes.test.ts`, update `createSummaryRouter` calls to remove `getTelegramPhotoData` and `s3Service` params. Update test data to include `description` on photo items where expected.

- [ ] **Step 5: Update bot summary handler tests**

In `tests/bot/summary.handler.test.ts`, remove mock setups for photo download/describe. Ensure items in test data have `description` field where photo descriptions are expected.

- [ ] **Step 6: Run all tests**

Run:
```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/routes/summary.routes.ts src/api/router.ts src/index.ts src/bot/handlers/summary.ts tests/api/routes/summary.routes.test.ts tests/bot/summary.handler.test.ts
git commit -m "refactor: summary reads stored photo descriptions instead of calling Vision API"
```

---

### Task 7: Remove `describePhotos` and `SummaryPhotoInput` from SummaryService

**Files:**
- Modify: `src/services/summary.service.ts`
- Modify: `tests/services/summary.service.test.ts`

- [ ] **Step 1: Remove `describePhotos` method and `SummaryPhotoInput` type**

In `src/services/summary.service.ts`:
- Remove `export type SummaryPhotoInput`
- Remove `async describePhotos(photos: SummaryPhotoInput[])` method
- Keep `detectImageMimeTypeFromBuffer`, `resolveVisionImageMimeType` (used by `describePhoto`)
- Keep `PhotoDescriptionInput` export (used by bot handlers and REST API)

- [ ] **Step 2: Remove `describePhotos` tests**

In `tests/services/summary.service.test.ts`, remove the entire `describe("describePhotos", ...)` block.

- [ ] **Step 3: Run tests**

Run:
```bash
npm test -- tests/services/summary.service.test.ts
```

Expected: All remaining tests PASS.

- [ ] **Step 4: Verify no remaining references to removed types**

Run:
```bash
npm run build
```

Expected: No errors. If any file still imports `SummaryPhotoInput`, fix the import.

- [ ] **Step 5: Commit**

```bash
git add src/services/summary.service.ts tests/services/summary.service.test.ts
git commit -m "refactor: remove describePhotos and SummaryPhotoInput (replaced by describePhoto)"
```

---

### Task 8: Backfill Script for Existing Photos

**Files:**
- Create: `scripts/backfill-descriptions.ts`

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-descriptions.ts`:

```typescript
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { SummaryService } from "../src/services/summary.service.js";
import { downloadTelegramFileWithMeta } from "../src/utils/telegram.js";
import { S3Service } from "../src/services/s3.service.js";
import { Bot } from "grammy";
import pino from "pino";

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

async function main(): Promise<void> {
  const log = pino({ level: "info" });

  const botToken = process.env.BOT_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!botToken || !openaiKey) {
    console.error("BOT_TOKEN and OPENAI_API_KEY env vars are required");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const openai = new OpenAI({ apiKey: openaiKey });
  const summaryService = new SummaryService(prisma, openai, log);
  const bot = new Bot(botToken);

  const s3Service =
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? new S3Service({
          endpoint: process.env.S3_ENDPOINT,
          bucket: process.env.S3_BUCKET,
          accessKey: process.env.S3_ACCESS_KEY,
          secretKey: process.env.S3_SECRET_KEY,
          region: process.env.S3_REGION,
        })
      : null;

  try {
    const photos = await prisma.entryItem.findMany({
      where: { type: "photo", description: null },
      select: { id: true, fileId: true, s3Key: true },
      orderBy: { createdAt: "asc" },
    });

    const total = photos.length;
    console.log(`Found ${total} photos without descriptions`);

    if (total === 0) {
      return;
    }

    let described = 0;
    let skipped = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = photos.slice(i, i + BATCH_SIZE);

      for (const photo of batch) {
        try {
          let data: Buffer;
          let mimeType: string;

          if (photo.fileId) {
            const file = await downloadTelegramFileWithMeta(bot.api, botToken, photo.fileId);
            data = file.data;
            mimeType = file.mimeType;
          } else if (photo.s3Key && s3Service) {
            const s3Photo = await s3Service.getObjectData(photo.s3Key);
            data = s3Photo.data;
            mimeType = s3Photo.mimeType ?? "image/jpeg";
          } else {
            skipped++;
            continue;
          }

          const description = await summaryService.describePhoto({ mimeType, data });

          if (description) {
            await prisma.entryItem.update({
              where: { id: photo.id },
              data: { description },
            });
            described++;
          } else {
            skipped++;
          }

          console.log(`[${described + skipped}/${total}] ${description ? "Described" : "Skipped"} ${photo.id}`);
        } catch (error) {
          skipped++;
          console.error(`[${described + skipped}/${total}] Failed ${photo.id}:`, error instanceof Error ? error.message : error);
        }
      }

      if (i + BATCH_SIZE < total) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`\nDone: ${described} described, ${skipped} skipped out of ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Test the script compiles**

Run:
```bash
npx tsx --no-warnings scripts/backfill-descriptions.ts --help 2>&1 || true
npm run build
```

Expected: Script fails with "BOT_TOKEN and OPENAI_API_KEY env vars are required" (expected — no env vars locally). Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-descriptions.ts
git commit -m "feat: add backfill script for existing photo descriptions"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run:
```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 2: Run lint**

Run:
```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 3: Run build**

Run:
```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Verify no unused imports/references**

Search for any remaining references to removed items:

```bash
grep -r "SummaryPhotoInput\|describePhotos\|getTelegramPhotoData" src/ --include="*.ts" || echo "Clean"
```

Expected: "Clean" (no references found). `getTelegramPhotoData` may still appear in the backfill script via `downloadTelegramFileWithMeta` which is fine — the removed one was the wrapper in `index.ts`.

- [ ] **Step 5: Commit any remaining fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: cleanup remaining references after eager photo descriptions refactor"
```
