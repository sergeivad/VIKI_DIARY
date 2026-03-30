# Eager Photo Descriptions

**Date:** 2026-03-30
**Status:** Approved

## Problem

Summary generation downloads ALL photos for a month and describes them via OpenAI Vision API in parallel (`Promise.all`). With 50+ photos this causes `APIConnectionTimeoutError`, `ECONNRESET`, and `other side closed` errors. Photos that fail are silently skipped, producing summaries without photo context.

## Solution

Describe photos at upload time (fire-and-forget, same pattern as tagging). Store descriptions in the database. Summary generation reads stored descriptions instead of calling Vision API.

## Schema Change

Add `description` field to `EntryItem`:

```prisma
model EntryItem {
  // ... existing fields ...
  description String? @map("description")
}
```

Migration: `ALTER TABLE entry_items ADD COLUMN description TEXT`.

## Photo Description at Upload Time

New method in `SummaryService`:

```typescript
async describePhoto(photo: SummaryPhotoInput): Promise<string | null>
```

Single GPT-4o-mini Vision call (same prompt: "Опиши что на фотографии одним предложением на русском"). Returns description or `null` on error.

### Invocation Points (fire-and-forget)

1. **Bot** (`mediaGroup.ts` + `diary.ts`): after `createOrAppend()`, alongside tagging. Download photo from Telegram, describe, write `description` to `EntryItem`.

2. **Mini App** (`entries.routes.ts`): after entry creation / media addition. Download photo from S3 via `s3Service.getObjectData()`, describe, write `description` to `EntryItem`.

Pattern:
```typescript
void describeAndSavePhoto(entryItem, photoData).catch(err => log.error(...));
```

## Summary Generation Changes

Remove all photo download and Vision API calls from:
- `src/api/routes/summary.routes.ts`
- `src/bot/handlers/summary.ts`

Replace with reading `item.description` from already-loaded entry items:
```typescript
const photoDescs = entry.items
  .filter(item => item.type === "photo" && item.description)
  .map(item => `[Фото: ${item.description}]`);
```

### Removed Code

- `summaryService.describePhotos()` method (batch parallel)
- `SummaryPhotoInput` type
- `getTelegramPhotoData` usage in summary flow
- `s3Service.getObjectData` usage in summary flow
- Photo download logic in bot summary handler

`detectImageMimeTypeFromBuffer` and `resolveVisionImageMimeType` move into the new `describePhoto` method.

## Backfill Migration Script

`scripts/backfill-descriptions.ts` — one-time CLI to describe existing photos.

1. Select all `EntryItem` where `type = 'photo'` AND `description IS NULL`
2. Process in batches of 5
3. For each photo: download (Telegram API by `fileId` or S3 by `s3Key`), describe via Vision, write `description`
4. 1-second pause between batches
5. Log progress: `[12/87] Described photo abc123`
6. Idempotent: only processes `description IS NULL`, safe to re-run

Run: `npx tsx scripts/backfill-descriptions.ts`

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | + `description String?` on `EntryItem` |
| `src/services/summary.service.ts` | + `describePhoto()`, - `describePhotos()`, - `SummaryPhotoInput` |
| `src/bot/middleware/mediaGroup.ts` | + fire-and-forget photo description |
| `src/bot/handlers/diary.ts` | + fire-and-forget photo description |
| `src/api/routes/entries.routes.ts` | + fire-and-forget photo description |
| `src/api/routes/summary.routes.ts` | Remove photo download/describe, read `item.description` |
| `src/bot/handlers/summary.ts` | Remove photo download/describe, read `item.description` |
| `scripts/backfill-descriptions.ts` | New: backfill existing photos |

## What Does NOT Change

Tagging, notifications, upload route, media proxy, everything else.
