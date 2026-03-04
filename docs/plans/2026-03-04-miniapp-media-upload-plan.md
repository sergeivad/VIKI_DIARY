# Mini App Media Upload — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable photo/video upload from Mini App create/edit screens via Beget S3 storage.

**Architecture:** Dual-source media: bot uploads stay on Telegram (`fileId`), Mini App uploads go to Beget S3 (`s3Key`). Backend proxies Telegram files, redirects S3 files via presigned URLs. ffmpeg generates video thumbnails at upload time.

**Tech Stack:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` for S3, `multer` for multipart parsing, `fluent-ffmpeg` for thumbnails, Zod for env validation.

**Design doc:** `docs/plans/2026-03-04-miniapp-media-upload-design.md`

---

## Task 1: Prisma migration — add S3 fields to EntryItem

**Files:**
- Modify: `prisma/schema.prisma` (EntryItem model, ~line 81)
- Create: migration file (auto-generated)
- Modify: `src/db/client.ts` (no changes needed — no new enums)

**Step 1: Add s3Key and thumbnailS3Key to EntryItem model**

In `prisma/schema.prisma`, add two fields to the `EntryItem` model after `thumbnailFileId`:

```prisma
model EntryItem {
  id                String       @id @default(uuid()) @db.Uuid
  entryId           String       @map("entry_id") @db.Uuid
  type              EntryItemType
  textContent       String?      @map("text_content")
  fileId            String?      @map("file_id")
  thumbnailFileId   String?      @map("thumbnail_file_id")
  s3Key             String?      @map("s3_key")
  thumbnailS3Key    String?      @map("thumbnail_s3_key")
  orderIndex        Int          @map("order_index")
  createdAt         DateTime     @default(now()) @map("created_at")

  entry             DiaryEntry   @relation(fields: [entryId], references: [id], onDelete: Cascade)

  @@index([entryId, orderIndex])
  @@map("entry_items")
}
```

**Step 2: Generate and apply migration**

Run: `npm run prisma:migrate:dev -- --name add-s3-key-to-entry-items`

Expected: Migration created and applied successfully.

**Step 3: Regenerate Prisma client**

Run: `npm run prisma:generate`

**Step 4: Verify build**

Run: `npm run build`

Expected: No errors.

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: add s3Key and thumbnailS3Key to EntryItem schema"
```

---

## Task 2: Environment variables for S3

**Files:**
- Modify: `src/config/env.ts` (~line 1-15)
- Modify: `docker-compose.dokploy.yml` (environment section)

**Step 1: Add S3 env vars to Zod schema**

In `src/config/env.ts`, add to `EnvSchema`:

```typescript
S3_ENDPOINT: z.string().url().optional(),
S3_BUCKET: z.string().min(1).optional(),
S3_ACCESS_KEY: z.string().min(1).optional(),
S3_SECRET_KEY: z.string().min(1).optional(),
S3_REGION: z.string().default("ru-1"),
```

Make them optional so the app still starts without S3 configured (bot-only mode).

**Step 2: Add env vars to docker-compose.dokploy.yml**

```yaml
S3_ENDPOINT: ${S3_ENDPOINT}
S3_BUCKET: ${S3_BUCKET}
S3_ACCESS_KEY: ${S3_ACCESS_KEY}
S3_SECRET_KEY: ${S3_SECRET_KEY}
S3_REGION: ${S3_REGION:-ru-1}
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/config/env.ts docker-compose.dokploy.yml
git commit -m "feat: add S3 environment variables"
```

---

## Task 3: S3 Service

**Files:**
- Create: `src/services/s3.service.ts`
- Create: `src/services/s3.errors.ts`
- Modify: `src/api/middleware/errorHandler.ts` (add S3 error mapping)
- Test: `tests/services/s3.service.test.ts`

**Step 1: Install AWS SDK**

Run: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

**Step 2: Create S3 error classes**

Create `src/services/s3.errors.ts`:

```typescript
export const S3ErrorCode = {
  uploadFailed: "UPLOAD_FAILED",
  fileTooLarge: "FILE_TOO_LARGE",
  unsupportedMediaType: "UNSUPPORTED_MEDIA_TYPE",
  s3NotConfigured: "S3_NOT_CONFIGURED",
} as const;

export type S3ErrorCodeValue = (typeof S3ErrorCode)[keyof typeof S3ErrorCode];

export class S3DomainError extends Error {
  constructor(
    public readonly code: S3ErrorCodeValue,
    message: string,
  ) {
    super(message);
    this.name = "S3DomainError";
  }
}
```

**Step 3: Add S3 error mapping to error handler**

In `src/api/middleware/errorHandler.ts`, add import and mapping:

```typescript
import { S3DomainError, S3ErrorCode } from "../../services/s3.errors.js";

const s3CodeToHttp: Record<string, number> = {
  [S3ErrorCode.uploadFailed]: 502,
  [S3ErrorCode.fileTooLarge]: 413,
  [S3ErrorCode.unsupportedMediaType]: 415,
  [S3ErrorCode.s3NotConfigured]: 503,
};
```

Add handler block after the SummaryDomainError block:

```typescript
if (err instanceof S3DomainError) {
  res.status(s3CodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
  return;
}
```

**Step 4: Create S3 service**

Create `src/services/s3.service.ts`:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { S3DomainError, S3ErrorCode } from "./s3.errors.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

export type UploadResult = {
  s3Key: string;
  mimeType: string;
  size: number;
};

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  validateFile(mimeType: string, size: number): void {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new S3DomainError(
        S3ErrorCode.unsupportedMediaType,
        `Unsupported file type: ${mimeType}`,
      );
    }
    if (size > MAX_FILE_SIZE) {
      throw new S3DomainError(
        S3ErrorCode.fileTooLarge,
        `File too large: ${Math.round(size / 1024 / 1024)}MB (max 50MB)`,
      );
    }
  }

  async upload(
    buffer: Buffer,
    mimeType: string,
    prefix: string,
  ): Promise<UploadResult> {
    this.validateFile(mimeType, buffer.length);

    const ext = MIME_TO_EXT[mimeType] ?? extname(mimeType);
    const s3Key = `${prefix}/${randomUUID()}${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      throw new S3DomainError(
        S3ErrorCode.uploadFailed,
        `Failed to upload to S3: ${(err as Error).message}`,
      );
    }

    return { s3Key, mimeType, size: buffer.length };
  }

  async getPresignedUrl(s3Key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }),
    );
  }

  isVideo(mimeType: string): boolean {
    return mimeType.startsWith("video/");
  }
}
```

**Step 5: Write tests**

Create `tests/services/s3.service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { S3DomainError, S3ErrorCode } from "../../src/services/s3.errors.js";
import { S3Service } from "../../src/services/s3.service.js";

// Only test validation (no real S3 calls)
describe("S3Service", () => {
  const config = {
    endpoint: "https://s3.test.cloud",
    bucket: "test-bucket",
    accessKey: "key",
    secretKey: "secret",
    region: "ru-1",
  };

  it("validates allowed mime types", () => {
    const service = new S3Service(config);
    expect(() => service.validateFile("image/jpeg", 1000)).not.toThrow();
    expect(() => service.validateFile("video/mp4", 1000)).not.toThrow();
  });

  it("rejects unsupported mime types", () => {
    const service = new S3Service(config);
    expect(() => service.validateFile("application/pdf", 1000)).toThrow(S3DomainError);
    expect(() => service.validateFile("text/plain", 1000)).toThrow(S3DomainError);
  });

  it("rejects files over 50MB", () => {
    const service = new S3Service(config);
    const overLimit = 51 * 1024 * 1024;
    expect(() => service.validateFile("image/jpeg", overLimit)).toThrow(S3DomainError);
  });

  it("isVideo detects video mime types", () => {
    const service = new S3Service(config);
    expect(service.isVideo("video/mp4")).toBe(true);
    expect(service.isVideo("video/quicktime")).toBe(true);
    expect(service.isVideo("image/jpeg")).toBe(false);
  });
});
```

**Step 6: Run tests**

Run: `npm test -- tests/services/s3.service.test.ts`

Expected: All pass.

**Step 7: Commit**

```bash
git add src/services/s3.service.ts src/services/s3.errors.ts src/api/middleware/errorHandler.ts tests/services/s3.service.test.ts package.json package-lock.json
git commit -m "feat: add S3 service with validation and presigned URLs"
```

---

## Task 4: Thumbnail service (ffmpeg)

**Files:**
- Create: `src/services/thumbnail.service.ts`
- Modify: `Dockerfile` (add ffmpeg to runner stage)

**Step 1: Add ffmpeg to Dockerfile runner stage**

In `Dockerfile`, after `FROM node:22-alpine AS runner`, add:

```dockerfile
RUN apk add --no-cache ffmpeg
```

So the runner stage becomes:

```dockerfile
FROM node:22-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app
...
```

**Step 2: Create thumbnail service**

Create `src/services/thumbnail.service.ts`:

```typescript
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { logger } from "../config/logger.js";

const execFileAsync = promisify(execFile);

export class ThumbnailService {
  /**
   * Extracts a thumbnail from a video buffer at 1s mark.
   * Returns JPEG buffer or null if extraction fails.
   */
  async extractVideoThumbnail(videoBuffer: Buffer): Promise<Buffer | null> {
    const tempDir = await mkdtemp(join(tmpdir(), "thumb-"));
    const inputPath = join(tempDir, `${randomUUID()}.mp4`);
    const outputPath = join(tempDir, `${randomUUID()}.jpg`);

    try {
      await writeFile(inputPath, videoBuffer);

      await execFileAsync("ffmpeg", [
        "-i", inputPath,
        "-ss", "1",
        "-vframes", "1",
        "-vf", "scale=320:-1",
        "-q:v", "5",
        "-f", "image2",
        outputPath,
      ], { timeout: 15_000 });

      return await readFile(outputPath);
    } catch (err) {
      logger.warn({ err }, "Failed to extract video thumbnail");
      return null;
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/services/thumbnail.service.ts Dockerfile
git commit -m "feat: add thumbnail service with ffmpeg"
```

---

## Task 5: Modify DiaryService to accept S3 media items

**Files:**
- Modify: `src/services/diary.service.ts` (DiaryItemInput type + normalizeItems)
- Modify: `tests/services/diary.service.test.ts` (add test for s3Key items)

**Step 1: Extend DiaryItemInput type**

In `src/services/diary.service.ts`, update the type (line 9-14):

```typescript
export type DiaryItemInput = {
  type: "text" | "photo" | "video" | "voice";
  textContent?: string | null;
  fileId?: string | null;
  thumbnailFileId?: string | null;
  s3Key?: string | null;
  thumbnailS3Key?: string | null;
};
```

**Step 2: Extend NormalizedDiaryItem type**

Update `NormalizedDiaryItem` (line 110-115):

```typescript
type NormalizedDiaryItem = {
  type: EntryItemTypeEnum;
  textContent: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  s3Key: string | null;
  thumbnailS3Key: string | null;
};
```

**Step 3: Update normalizeItems to accept s3Key OR fileId**

Replace the media validation block (lines 158-177):

```typescript
// For media items (photo, video, voice)
const fileId = normalizeText(item.fileId);
const s3Key = normalizeText(item.s3Key);

if (!fileId && !s3Key) {
  throw new DiaryDomainError(
    DiaryErrorCode.invalidItems,
    "Media item must include file id or s3 key"
  );
}

const typeMap = {
  photo: EntryItemType.photo,
  video: EntryItemType.video,
  voice: EntryItemType.voice
} as const;

return {
  type: typeMap[item.type as keyof typeof typeMap],
  textContent: normalizeText(item.textContent),
  fileId,
  thumbnailFileId: normalizeText(item.thumbnailFileId),
  s3Key,
  thumbnailS3Key: normalizeText(item.thumbnailS3Key),
};
```

**Step 4: Update createEntryTx** to include s3Key in item creation data

Find where `items.create` is built (the Prisma create call inside the transaction). Add `s3Key` and `thumbnailS3Key` to each item's data:

```typescript
items: {
  create: normalizedItems.map((item, i) => ({
    type: item.type,
    textContent: item.textContent,
    fileId: item.fileId,
    thumbnailFileId: item.thumbnailFileId,
    s3Key: item.s3Key,
    thumbnailS3Key: item.thumbnailS3Key,
    orderIndex: startIndex + i,
  })),
},
```

Do the same for `addItemsToEntryTx`.

**Step 5: Write test for s3Key items**

Add to `tests/services/diary.service.test.ts`:

```typescript
it("creates entry with s3Key media item", async () => {
  const now = new Date("2026-03-04T12:00:00.000Z");
  const create = vi.fn().mockResolvedValue({
    id: "entry-1",
    babyId: "baby-1",
    authorId: "user-1",
    eventDate: new Date("2026-03-04"),
    mergeWindowUntil: new Date("2026-03-04T12:10:00.000Z"),
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: "item-1",
        type: EntryItemType.photo,
        textContent: null,
        fileId: null,
        thumbnailFileId: null,
        s3Key: "uploads/baby-1/abc.jpg",
        thumbnailS3Key: null,
        orderIndex: 0,
        createdAt: now,
      },
    ],
    author: { id: "user-1", firstName: "Test", username: null, avatarFileId: null },
  });

  const db = { diaryEntry: { create } } as unknown as PrismaClient;
  const service = new DiaryService(db);

  const result = await service.createEntry({
    babyId: "baby-1",
    authorId: "user-1",
    items: [{ type: "photo", s3Key: "uploads/baby-1/abc.jpg" }],
    now,
  });

  expect(result.items[0].s3Key).toBe("uploads/baby-1/abc.jpg");
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        items: {
          create: [
            expect.objectContaining({
              s3Key: "uploads/baby-1/abc.jpg",
              fileId: null,
            }),
          ],
        },
      }),
    }),
  );
});

it("rejects media item without fileId or s3Key", async () => {
  const db = {} as unknown as PrismaClient;
  const service = new DiaryService(db);

  await expect(
    service.createEntry({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "photo" }],
    }),
  ).rejects.toThrow("Media item must include file id or s3 key");
});
```

**Step 6: Run tests**

Run: `npm test`

Expected: All pass.

**Step 7: Commit**

```bash
git add src/services/diary.service.ts tests/services/diary.service.test.ts
git commit -m "feat: support s3Key in diary item creation"
```

---

## Task 6: Upload API endpoint

**Files:**
- Create: `src/api/routes/upload.routes.ts`
- Modify: `src/api/router.ts` (mount upload route)
- Modify: `src/index.ts` (instantiate S3Service + ThumbnailService, pass to router)

**Step 1: Install multer**

Run: `npm install multer && npm install -D @types/multer`

**Step 2: Create upload route**

Create `src/api/routes/upload.routes.ts`:

```typescript
import { Router } from "express";
import type { Response, NextFunction } from "express";
import multer from "multer";
import type { S3Service } from "../../services/s3.service.js";
import type { ThumbnailService } from "../../services/thumbnail.service.js";
import type { AuthedRequest } from "../types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export function createUploadRouter(
  s3Service: S3Service,
  thumbnailService: ThumbnailService,
): Router {
  const router = Router();

  // POST / — upload single file to S3
  router.post(
    "/",
    upload.single("file"),
    async (req, res: Response, next: NextFunction) => {
      try {
        const { actor } = req as unknown as AuthedRequest;
        const file = req.file;

        if (!file) {
          res.status(400).json({ error: "file is required" });
          return;
        }

        s3Service.validateFile(file.mimetype, file.size);

        const prefix = `uploads/${actor.userId}`;
        const result = await s3Service.upload(file.buffer, file.mimetype, prefix);

        let thumbnailS3Key: string | null = null;

        if (s3Service.isVideo(file.mimetype)) {
          const thumbBuffer = await thumbnailService.extractVideoThumbnail(file.buffer);
          if (thumbBuffer) {
            const thumbResult = await s3Service.upload(
              thumbBuffer,
              "image/jpeg",
              `${prefix}/thumbs`,
            );
            thumbnailS3Key = thumbResult.s3Key;
          }
        }

        res.status(201).json({
          s3Key: result.s3Key,
          thumbnailS3Key,
          mimeType: result.mimeType,
          size: result.size,
          type: s3Service.isVideo(file.mimetype) ? "video" : "photo",
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
```

**Step 3: Mount upload route in router**

In `src/api/router.ts`, add import and mount after auth middleware (upload requires auth):

```typescript
import { createUploadRouter } from "./routes/upload.routes.js";

// Inside createApiRouter, after auth middleware:
router.use("/upload", createUploadRouter(services.s3Service, services.thumbnailService));
```

Update the `createApiRouter` function signature to accept `Services` type that includes `s3Service` and `thumbnailService` (or pass them separately).

**Step 4: Instantiate services in index.ts**

In `src/index.ts`, add:

```typescript
import { S3Service } from "./services/s3.service.js";
import { ThumbnailService } from "./services/thumbnail.service.js";

// After other service instantiation:
const s3Service = env.S3_ENDPOINT && env.S3_BUCKET
  ? new S3Service({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY!,
      secretKey: env.S3_SECRET_KEY!,
      region: env.S3_REGION,
    })
  : null;

const thumbnailService = new ThumbnailService();

// Add to services object
const services = {
  // ...existing
  s3Service,
  thumbnailService,
};
```

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/api/routes/upload.routes.ts src/api/router.ts src/index.ts package.json package-lock.json
git commit -m "feat: add upload API endpoint for S3 media"
```

---

## Task 7: Extend entry creation to accept media array

**Files:**
- Modify: `src/api/routes/entries.routes.ts` (POST / — accept media array)

**Step 1: Update POST / to accept optional media array**

In `src/api/routes/entries.routes.ts`, update the POST handler (line 57-88):

```typescript
router.post("/", async (req, res: Response, next: NextFunction) => {
  try {
    const { actor } = req as AuthedRequest;
    const { babyId, text, eventDate, media } = req.body as {
      babyId?: string;
      text?: string;
      eventDate?: string;
      media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>;
    };

    if (!babyId) {
      res.status(400).json({ error: "babyId is required" });
      return;
    }

    if (!text && (!media || media.length === 0)) {
      res.status(400).json({ error: "text or media is required" });
      return;
    }

    const items: Array<import("../../services/diary.service.js").DiaryItemInput> = [];

    if (text) {
      items.push({ type: "text", textContent: text });
    }

    if (media) {
      for (const m of media) {
        items.push({
          type: m.type,
          s3Key: m.s3Key,
          thumbnailS3Key: m.thumbnailS3Key ?? null,
        });
      }
    }

    const entry = await diaryService.createEntry({
      babyId,
      authorId: actor.userId,
      eventDate: eventDate ? new Date(eventDate) : undefined,
      items,
    });

    // Fire-and-forget tagging (only if text present)
    if (text) {
      taggingService
        .generateTags(text)
        .then((tags) => diaryService.updateTags(entry.id, tags))
        .catch((err) => logger.error({ err }, "Fire-and-forget tagging failed"));
    }

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});
```

**Step 2: Add POST /:id/media — add media to existing entry**

Add new endpoint after the DELETE handler:

```typescript
// POST /:id/media — add media items to existing entry
router.post("/:id/media", async (req, res: Response, next: NextFunction) => {
  try {
    const { actor } = req as unknown as AuthedRequest;
    const { media } = req.body as {
      media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>;
    };

    if (!media || media.length === 0) {
      res.status(400).json({ error: "media array is required" });
      return;
    }

    const items = media.map((m) => ({
      type: m.type as "photo" | "video",
      s3Key: m.s3Key,
      thumbnailS3Key: m.thumbnailS3Key ?? null,
    }));

    const entry = await diaryService.addItemsToEntry({
      entryId: req.params.id,
      actorId: actor.userId,
      items,
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Run tests**

Run: `npm test`

**Step 5: Commit**

```bash
git add src/api/routes/entries.routes.ts
git commit -m "feat: accept media array in entry creation and add media endpoint"
```

---

## Task 8: Dual-source media proxy

**Files:**
- Modify: `src/api/routes/media.routes.ts` (add ?source=s3 support)
- Modify: `src/api/router.ts` (pass s3Service to media router)

**Step 1: Update media router to accept S3 service**

In `src/api/routes/media.routes.ts`, update the factory function signature and add S3 branch:

```typescript
import type { S3Service } from "../../services/s3.service.js";

export type GetFileUrl = (fileId: string) => Promise<string>;

export function createMediaRouter(
  getFileUrl: GetFileUrl,
  s3Service: S3Service | null,
): Router {
  const router = Router();

  router.get("/:id", async (req, res, next) => {
    try {
      const source = req.query.source as string | undefined;
      const id = req.params.id.trim();

      // S3 source: redirect to presigned URL
      if (source === "s3" && s3Service) {
        const presignedUrl = await s3Service.getPresignedUrl(id);
        res.redirect(302, presignedUrl);
        return;
      }

      // Telegram source (default): proxy as before
      const url = await getFileUrl(id);
      const upstream = await fetch(url);
      // ... existing proxy logic unchanged ...
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

**Step 2: Update router.ts to pass s3Service**

```typescript
router.use("/media", createMediaRouter(getFileUrl, services.s3Service));
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/api/routes/media.routes.ts src/api/router.ts
git commit -m "feat: dual-source media proxy with S3 presigned redirect"
```

---

## Task 9: Mini App types + API client

**Files:**
- Modify: `miniapp/src/api/types.ts` (add s3Key fields)
- Modify: `miniapp/src/api/client.ts` (add upload method + update mediaUrl)

**Step 1: Update EntryItem type**

In `miniapp/src/api/types.ts`, add to `EntryItem`:

```typescript
export interface EntryItem {
  id: string;
  type: "text" | "photo" | "video" | "voice";
  textContent: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  s3Key: string | null;
  thumbnailS3Key: string | null;
  orderIndex: number;
}
```

**Step 2: Add UploadResult type**

```typescript
export interface UploadResult {
  s3Key: string;
  thumbnailS3Key: string | null;
  mimeType: string;
  size: number;
  type: "photo" | "video";
}
```

**Step 3: Update API client**

In `miniapp/src/api/client.ts`, add upload method:

```typescript
async uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${this.baseUrl}/upload`, {
    method: "POST",
    headers: {
      Authorization: `tma ${this.initData}`,
      // DO NOT set Content-Type — browser sets multipart boundary automatically
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }

  return res.json();
}
```

Update `createEntry` to accept optional media:

```typescript
createEntry(
  babyId: string,
  text: string,
  eventDate?: string,
  media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>,
): Promise<DiaryEntry> {
  return this.request("/entries", {
    method: "POST",
    body: JSON.stringify({ babyId, text: text || undefined, eventDate, media }),
  });
}
```

Add method to add media to existing entry:

```typescript
addMediaToEntry(
  entryId: string,
  media: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>,
): Promise<DiaryEntry> {
  return this.request(`/entries/${entryId}/media`, {
    method: "POST",
    body: JSON.stringify({ media }),
  });
}
```

Update `mediaUrl` for dual source:

```typescript
mediaUrl(item: { fileId: string | null; s3Key: string | null; thumbnailFileId?: string | null; thumbnailS3Key?: string | null }, thumbnail = false): string {
  if (thumbnail) {
    if (item.thumbnailS3Key) return `${this.baseUrl}/media/${encodeURIComponent(item.thumbnailS3Key)}?source=s3`;
    if (item.thumbnailFileId) return `${this.baseUrl}/media/${encodeURIComponent(item.thumbnailFileId)}`;
  }
  if (item.s3Key) return `${this.baseUrl}/media/${encodeURIComponent(item.s3Key)}?source=s3`;
  if (item.fileId) return `${this.baseUrl}/media/${encodeURIComponent(item.fileId)}`;
  return "";
}

// Keep old method for backward compat (used in many places):
mediaUrlByFileId(fileId: string): string {
  return `${this.baseUrl}/media/${encodeURIComponent(fileId)}`;
}
```

**Step 4: Verify build**

Run: `cd miniapp && npm run build`

**Step 5: Commit**

```bash
git add miniapp/src/api/types.ts miniapp/src/api/client.ts
git commit -m "feat: mini app API client with upload and dual-source media URLs"
```

---

## Task 10: Update Mini App media rendering (feed, detail, edit screens)

**Files:**
- Modify: `miniapp/src/components/feed-screen.tsx` (use new mediaUrl)
- Modify: `miniapp/src/components/detail-screen.tsx` (use new mediaUrl)
- Modify: `miniapp/src/components/create-edit-screen.tsx` (edit screen media rendering)

**Step 1: Create helper for media URL resolution**

The `api.mediaUrl()` signature changed. Update all call sites across feed-screen, detail-screen, and create-edit-screen to pass the full item object instead of a bare fileId string.

Search for all `api.mediaUrl(` calls and update them. For example:

```typescript
// Before:
src={api.mediaUrl(media.fileId!)}
poster={media.thumbnailFileId ? api.mediaUrl(media.thumbnailFileId) : undefined}

// After:
src={api.mediaUrl(media)}
poster={api.mediaUrl(media, true)}
```

Do this for all three screen files. Keep `api.mediaUrlByFileId()` for the few places that only have a raw fileId string (e.g., avatar).

**Step 2: Verify build**

Run: `cd miniapp && npm run build`

**Step 3: Commit**

```bash
git add miniapp/src/components/feed-screen.tsx miniapp/src/components/detail-screen.tsx miniapp/src/components/create-edit-screen.tsx
git commit -m "refactor: update media URL resolution to support dual source"
```

---

## Task 11: Create Screen — media upload UI

**Files:**
- Modify: `miniapp/src/components/create-edit-screen.tsx` (CreateScreen component)

**Step 1: Add media upload state and handlers**

In `CreateScreen`, add state for pending uploads:

```typescript
type PendingMedia = {
  id: string;             // temp ID for React key
  file: File;
  preview: string;        // object URL for thumbnail
  status: "uploading" | "done" | "error";
  s3Key?: string;
  thumbnailS3Key?: string;
  type: "photo" | "video";
};

export function CreateScreen() {
  const { navigate, addEntry, showSnackbar, baby } = useApp();
  const [text, setText] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = pendingMedia.some((m) => m.status === "uploading");
  const canSave = (text.trim().length > 0 || pendingMedia.some((m) => m.status === "done")) && !isUploading;
```

**Step 2: Add file selection handler**

```typescript
function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(e.target.files ?? []);
  if (files.length === 0) return;

  const remaining = 10 - pendingMedia.length;
  const toAdd = files.slice(0, remaining);

  for (const file of toAdd) {
    const id = crypto.randomUUID();
    const type = file.type.startsWith("video/") ? "video" : "photo";
    const preview = URL.createObjectURL(file);

    setPendingMedia((prev) => [...prev, { id, file, preview, status: "uploading", type }]);

    // Upload immediately
    api.uploadFile(file)
      .then((result) => {
        setPendingMedia((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, status: "done", s3Key: result.s3Key, thumbnailS3Key: result.thumbnailS3Key } : m
          ),
        );
      })
      .catch(() => {
        setPendingMedia((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: "error" } : m)),
        );
      });
  }

  // Reset input so same file can be re-selected
  e.target.value = "";
}
```

**Step 3: Add remove handler**

```typescript
function removeMedia(id: string) {
  setPendingMedia((prev) => {
    const item = prev.find((m) => m.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    return prev.filter((m) => m.id !== id);
  });
}
```

**Step 4: Update handleSave to include media**

```typescript
async function handleSave() {
  if (!canSave || !baby) return;
  setSaving(true);

  try {
    const media = pendingMedia
      .filter((m) => m.status === "done" && m.s3Key)
      .map((m) => ({ s3Key: m.s3Key!, thumbnailS3Key: m.thumbnailS3Key, type: m.type }));

    const newEntry = await api.createEntry(baby.id, text.trim(), date, media.length > 0 ? media : undefined);
    window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success");
    addEntry(newEntry);
    showSnackbar("Записано!");
    navigate({ type: "feed" });
  } catch (err) {
    console.error("Failed to create entry:", err);
    showSnackbar("Ошибка сохранения");
  } finally {
    setSaving(false);
  }
}
```

**Step 5: Add UI elements**

Replace the info message ("Фото и видео можно добавить через бот") with:

```tsx
{/* Media upload */}
<div className="mb-5">
  <input
    ref={fileInputRef}
    type="file"
    accept="image/*,video/*"
    multiple
    className="hidden"
    onChange={handleFileSelect}
  />

  {/* Thumbnail strip */}
  {pendingMedia.length > 0 && (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
      {pendingMedia.map((media) => (
        <div key={media.id} className="relative shrink-0 h-20 w-20 rounded-xl overflow-hidden bg-muted">
          <img
            src={media.preview}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {media.status === "uploading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          )}
          {media.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/40">
              <span className="text-white text-xs">Ошибка</span>
            </div>
          )}
          {media.type === "video" && media.status === "done" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-5 w-5 text-white drop-shadow" />
            </div>
          )}
          <button
            onClick={() => removeMedia(media.id)}
            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center"
          >
            <span className="text-white text-xs leading-none">✕</span>
          </button>
        </div>
      ))}
    </div>
  )}

  {/* Add button */}
  {pendingMedia.length < 10 && (
    <button
      onClick={() => fileInputRef.current?.click()}
      disabled={saving}
      className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
    >
      <ImagePlus className="h-4 w-4" />
      Добавить фото / видео
      {pendingMedia.length > 0 && (
        <span className="text-muted-foreground">({pendingMedia.length}/10)</span>
      )}
    </button>
  )}
</div>
```

Add `ImagePlus` to the lucide-react import:

```typescript
import { Calendar, Loader2, Info, Video, ImagePlus } from "lucide-react";
```

**Step 6: Update save button text**

```tsx
{saving ? (
  <>
    <Loader2 className="h-4 w-4 animate-spin" />
    Сохраняем...
  </>
) : isUploading ? (
  <>
    <Loader2 className="h-4 w-4 animate-spin" />
    Загружаем файлы...
  </>
) : (
  "Сохранить"
)}
```

**Step 7: Verify build**

Run: `cd miniapp && npm run build`

**Step 8: Commit**

```bash
git add miniapp/src/components/create-edit-screen.tsx
git commit -m "feat: media upload UI in create screen"
```

---

## Task 12: Edit Screen — add media to existing entries

**Files:**
- Modify: `miniapp/src/components/create-edit-screen.tsx` (EditScreen component)

**Step 1: Add same PendingMedia state to EditScreen**

Reuse the same `PendingMedia` type. Add the same state, handlers (`handleFileSelect`, `removeMedia`), and UI as in CreateScreen.

**Step 2: Update handleSave in EditScreen**

After existing text/date save logic, add media upload:

```typescript
// After text and date updates...
const mediaToAdd = pendingMedia
  .filter((m) => m.status === "done" && m.s3Key)
  .map((m) => ({ s3Key: m.s3Key!, thumbnailS3Key: m.thumbnailS3Key, type: m.type }));

if (mediaToAdd.length > 0) {
  updated = await api.addMediaToEntry(entry.id, mediaToAdd);
}
```

Update `canSave`:

```typescript
const hasNewMedia = pendingMedia.some((m) => m.status === "done");
const canSave = (text.trim().length > 0 || hasNewMedia) &&
  (text !== initialText || date !== entry.eventDate || hasNewMedia) &&
  !isUploading;
```

**Step 3: Add upload UI below existing media thumbnails**

Place the file input, thumbnail strip, and "Добавить фото / видео" button right after the existing media display section.

**Step 4: Verify build**

Run: `cd miniapp && npm run build`

**Step 5: Commit**

```bash
git add miniapp/src/components/create-edit-screen.tsx
git commit -m "feat: media upload UI in edit screen"
```

---

## Task 13: Dockerfile + deploy config

**Files:**
- Verify: `Dockerfile` (ffmpeg already added in Task 4)
- Modify: `docker-compose.dokploy.yml` (S3 env vars already added in Task 2)

**Step 1: Verify full build**

Run: `npm run build && cd miniapp && npm run build`

**Step 2: Run all tests**

Run: `npm test`

**Step 3: Final commit**

If any remaining changes:

```bash
git add -A
git commit -m "chore: finalize media upload feature"
```

---

## Task 14: Configure S3 in Dokploy and deploy

**Step 1: Set environment variables in Dokploy**

In Dokploy panel, add to the app environment:

```
S3_ENDPOINT=https://s3.ru1.storage.beget.cloud
S3_BUCKET=8e278e33fa3d-vikidiary
S3_ACCESS_KEY=<from Beget panel>
S3_SECRET_KEY=<from Beget panel>
S3_REGION=ru-1
```

**Step 2: Push to dev and test**

```bash
git push origin dev
```

**Step 3: Test in Mini App**

1. Open Mini App → Create screen
2. Tap "Добавить фото / видео"
3. Select a photo → verify upload indicator → verify thumbnail appears
4. Select a video → verify thumbnail generated
5. Add text → Save → verify entry appears in feed with media
6. Open entry → verify media displays correctly
7. Edit entry → add another photo → Save → verify

**Step 4: Merge to main**

```bash
git checkout main && git merge dev && git push origin main
```
