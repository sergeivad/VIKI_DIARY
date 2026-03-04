# Mini App Media Upload — Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

Media (photos, videos) can only be added through the Telegram bot. The Mini App create/edit screens are text-only. Users want to attach media directly from the Mini App.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File storage | Beget S3 (new uploads); Telegram stays for bot uploads | No migration needed, both sources work in parallel |
| Upload flow | Mini App → Backend → S3 | Simple, full server-side validation, 50MB limit is fine |
| Video thumbnails | ffmpeg in main Docker image | +50MB to image, but no network calls, simple |
| S3 file delivery | Presigned URL redirect (302) | No server load for serving files |
| Media deletion | Only before saving (frontend-only) | Deletion from published entries — future scope |
| Upload limits | 50MB per file, 10 files per entry | Covers most phone photos/videos |

## Architecture

```
┌─────────────┐     POST /upload (multipart)     ┌──────────┐      PutObject       ┌─────────┐
│  Mini App   │ ──────────────────────────────▶   │ Backend  │ ──────────────────▶  │ Beget   │
│  (React)    │                                   │ Express  │                      │ S3      │
│             │     POST /entries {media:[]}       │          │   ffmpeg thumbnail   │         │
│             │ ──────────────────────────────▶   │          │ ──────────────────▶  │         │
│             │                                   │          │                      │         │
│             │  GET /media/:id?source=s3          │          │  302 → presigned URL │         │
│             │ ──────────────────────────────▶   │          │ ◀─ ─ ─ ─ ─ ─ ─ ─ ─  │         │
│             │ ◀─────── redirect ───────────────  │          │                      │         │
│             │ ═══════ direct download ═══════════════════════════════════════════▶ │         │
└─────────────┘                                   └──────────┘                      └─────────┘
```

**Dual source:** Telegram files (bot) identified by `fileId`, S3 files (Mini App) identified by `s3Key`. Media proxy detects source and routes accordingly.

## Database Changes

Add to `EntryItem` model:

```prisma
s3Key            String?  @map("s3_key")
thumbnailS3Key   String?  @map("thumbnail_s3_key")
```

Existing `fileId` and `thumbnailFileId` remain for Telegram-sourced media.

## API Changes

### New endpoint: Upload file

```
POST /api/v1/upload
Content-Type: multipart/form-data
Auth: tma <initData>
Body: file (binary)
Response: { s3Key, thumbnailS3Key?, mimeType, width?, height? }
```

- Validates type (image/jpeg, image/png, video/mp4, etc.) and size (≤50MB)
- Uploads to S3 at `uploads/{babyId}/{uuid}.{ext}`
- For videos: generates thumbnail via ffmpeg, uploads to S3

### Modified: Create entry

```
POST /api/v1/entries
Body: { babyId, text, eventDate, media?: [{ s3Key, thumbnailS3Key?, type }] }
```

### New endpoint: Add media to existing entry

```
POST /api/v1/entries/:id/media
Body: { media: [{ s3Key, thumbnailS3Key?, type }] }
```

### Modified: Media proxy

```
GET /api/v1/media/:id                → Telegram proxy (existing behavior)
GET /api/v1/media/:id?source=s3      → 302 redirect to presigned S3 URL
```

## Mini App UI

### Create Screen
- "Добавить фото/видео" button replaces the "Фото и видео можно добавить через бот" note
- System file picker (`<input type="file" accept="image/*,video/*" multiple>`)
- Horizontal thumbnail strip with progress indicator per file
- ✕ button on each thumbnail to remove before saving
- Counter "3/10 файлов"
- "Сохранить" button disabled while any file is uploading ("Загружаем файлы..." state)
- Files upload to S3 immediately on selection (don't wait for Save)

### Edit Screen
- Same "Добавить фото/видео" button below existing media thumbnails
- Existing media (Telegram/S3): shown as-is, no delete (future scope)
- Newly added media: with ✕ and progress
- "Сохранить" disabled during upload

### mediaUrl() helper
- If item has `s3Key` → `/api/v1/media/${s3Key}?source=s3`
- If item has `fileId` → `/api/v1/media/${fileId}` (existing)

## Infrastructure

- **Dockerfile:** add `apk add ffmpeg` to runner stage
- **Environment variables:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **New service:** `S3Service` — upload, getPresignedUrl, delete

## Future Backlog

- Cron job to clean orphaned S3 files (uploaded but never attached to an entry)
- Delete media from published entries via Edit Screen
- Migrate existing Telegram media to S3 (full unification)
