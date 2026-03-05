# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend
npm run dev              # Start with hot reload (tsx watch)
npm run build            # Compile TypeScript → dist/
npm test                 # Run all tests (vitest run)
npm run test:watch       # Tests in watch mode
npm test -- tests/services/diary.service.test.ts      # Run single test file
npm test -- -t "creates entry"                        # Run tests matching pattern
npm run lint             # ESLint
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:migrate:dev  # Create/apply migration in dev
npm run db:up            # Start local PostgreSQL via docker compose
npm run smoke:deploy     # Smoke test a deployed instance

# Mini App (frontend)
cd miniapp && npm run dev   # Vite dev server on :5173, proxies /api to :3000
cd miniapp && npm run build # Build to miniapp/dist/
```

## Architecture

Telegram baby diary bot + Mini App — Grammy + Express 5 + Prisma 7 + PostgreSQL + Vite/React.

**Entry point** (`src/index.ts`): Creates Express app, instantiates all services, creates bot, mounts REST API at `/api/v1`, serves Mini App static files at `/app/*`, mounts webhook handler, auto-sets Telegram webhook on startup.

**Service injection**: Services are created once in `index.ts` and injected into both bot context (via middleware in `src/bot/bot.ts`) and API router. All bot handlers access them as `ctx.services.<name>`, API routes receive them via factory functions.

**Key layers**:
- `src/bot/bot.ts` — Bot factory: middleware registration order (services → conversations → media groups → commands → callbacks → message handler)
- `src/bot/conversations/` — Multi-turn flows using `@grammyjs/conversations` (onboarding, date input, edit entry)
- `src/bot/handlers/` — Command and callback handlers (including `/app` to open Mini App)
- `src/bot/keyboards/` — Inline keyboard builders (entry actions, history pagination, summary months); `MINIAPP_URL` constant lives in `entryActions.ts`
- `src/bot/notifications/newEntry.ts` — Builds and dispatches new-entry notifications to other diary members
- `src/bot/formatters/entry.ts` — Entry preview text and media count formatting
- `src/bot/middleware/mediaGroup.ts` — Buffers media group messages (600ms), extracts best-quality photos/videos, creates diary entries
- `src/api/router.ts` — REST API router factory, mounts auth middleware + route modules + error handler
- `src/api/middleware/auth.ts` — Telegram Mini App initData HMAC validation
- `src/api/middleware/errorHandler.ts` — Maps domain errors (DiaryDomainError, etc.) to HTTP status codes
- `src/api/routes/` — REST API routes: baby, entries (CRUD), media (dual-source proxy), summary, upload
- `src/services/` — Business logic with Prisma transactions and row-level locking for concurrency (shared by bot and API)
- `src/services/transcription.service.ts` — Voice message transcription via OpenAI Whisper API (max 5 min)
- `src/services/tagging.service.ts` — Auto-tagging diary entries via GPT-4o-mini (fire-and-forget)
- `src/services/summary.service.ts` — Monthly diary summary generation via GPT-4o + photo descriptions via GPT-4o-mini Vision
- `src/services/s3.service.ts` — S3 file storage (upload, presigned URLs, delete) for Mini App media uploads
- `src/services/s3.errors.ts` — S3 domain error classes
- `src/services/thumbnail.service.ts` — Video thumbnail extraction via ffmpeg
- `src/services/notification.service.ts` — Notifies other diary members about new entries (supports text + reply_markup)
- `src/config/env.ts` — Zod-validated environment variables
- `src/types/bot.ts` — BotContext, Services, BotConversation type definitions
- `miniapp/` — Telegram Mini App (Vite + React 19 + Tailwind v4 + shadcn/ui)

## REST API

Auth: Telegram Mini App initData sent as `Authorization: tma <initData>` header, validated via HMAC-SHA256 with bot token.

```
GET    /api/v1/baby                 — baby info
GET    /api/v1/baby/members         — diary members
GET    /api/v1/baby/invite          — invite link
POST   /api/v1/baby/invite/regenerate — regenerate invite
GET    /api/v1/entries?babyId&page&limit — paginated feed
GET    /api/v1/entries/:id          — single entry
POST   /api/v1/entries              — create entry (text + optional media[])
POST   /api/v1/entries/:id/media    — add media to existing entry
PATCH  /api/v1/entries/:id/text     — update entry text
PATCH  /api/v1/entries/:id/date     — update event date
DELETE /api/v1/entries/:id          — delete entry
GET    /api/v1/media/:id            — proxy media (Telegram default, ?source=s3 for S3 presigned redirect)
POST   /api/v1/upload              — upload file to S3 (multipart/form-data)
POST   /api/v1/summary             — generate monthly AI summary (with photo Vision analysis)
```

## Mini App (miniapp/)

Vite + React 19 + Tailwind v4 + shadcn/ui SPA served at `/app/*`.

**Screens**: Feed (entry timeline), Detail (full entry view with photo lightbox), Create (text + date + media upload), Edit (text + date + media upload), Summary (monthly AI summary with multi-step progress).

**Key files**:
- `miniapp/src/api/client.ts` — API client with TMA auth
- `miniapp/src/hooks/useTelegram.ts` — Telegram WebApp SDK hook (initData, BackButton, haptics)
- `miniapp/src/components/app-context.tsx` — Global state, navigation, API integration
- `miniapp/src/components/feed-screen.tsx` — Entry cards with media grid
- `miniapp/vite.config.ts` — `base: "/app/"`, proxy `/api` to backend in dev

## Dual-source media

Media items (`EntryItem`) can come from two sources:
- **Telegram** (bot uploads): stored as `fileId` / `thumbnailFileId`, proxied via `/api/v1/media/:fileId`
- **S3** (Mini App uploads): stored as `s3Key` / `thumbnailS3Key`, served via `/api/v1/media/:s3Key?source=s3` (302 redirect to presigned URL)

Each item has either `fileId` or `s3Key` (never both). The Mini App API client's `mediaUrl(item)` resolves the correct URL automatically.

S3 config is optional — the app works without it (bot-only mode, no Mini App uploads).

## ESM + Prisma: CJS bridge (critical)

This project uses ESM (`"type": "module"`) with Node.js 22. `@prisma/client` v7 generates CommonJS, and Node.js 22 **prohibits named value imports from CJS modules**.

**Rule:** Never import enum values or runtime objects directly from `@prisma/client`.

```ts
// BAD — crashes at runtime in Node.js 22 ESM
import { EntryItemType } from "@prisma/client";

// GOOD — runtime values via the CJS→ESM bridge
import { EntryItemType } from "../db/client.js";

// GOOD — type-only imports are fine (erased at compile time)
import type { User, Baby, DiaryEntry } from "@prisma/client";
```

The bridge `src/db/client.ts` re-exports `PrismaClient`, `EntryItemType`, `BabyMemberRole`, `Prisma` via default import. When adding a new Prisma enum, add it to this file.

## Code conventions

- ESLint enforces `consistent-type-imports` — always use `import type` for type-only imports
- All `.ts` imports in source code must use `.js` extension (NodeNext module resolution)
- Services use constructor DI with PrismaClient; domain errors via custom error classes (`DiaryDomainError`, `InviteDomainError`, `TranscriptionError`, `SummaryDomainError`, `S3DomainError`)
- Tests mock Prisma client methods with `vi.fn()` — no real DB in tests

## Deployment

- Dokploy with Traefik reverse proxy, domain: `viki.deazmont.ru`
- Branch `dev` for testing, `main` for production; autodeploy on push
- `docker-compose.dokploy.yml` — production compose; do NOT expose `ports` (Traefik routes via internal Docker network)
- `scripts/entrypoint.sh` — runs Prisma migrations then starts the app
- Dockerfile has 4 stages: `deps` → `builder` (backend tsc) → `miniapp-builder` (Vite build) → `runner` (includes ffmpeg for video thumbnails)
- Mini App is served as static files at `/app/*` from the same Express server
- REST API is at `/api/v1/*` on the same domain
