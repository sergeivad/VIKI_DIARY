# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
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
```

## Architecture

Telegram baby diary bot — Grammy + Express 5 + Prisma 7 + PostgreSQL.

**Entry point** (`src/index.ts`): Creates Express app with health endpoints, instantiates all services, creates bot, mounts webhook handler, auto-sets Telegram webhook on startup.

**Service injection**: Services are created once in `index.ts` and injected into bot context via middleware in `src/bot/bot.ts`. All handlers access them as `ctx.services.<name>`.

**Key layers**:
- `src/bot/bot.ts` — Bot factory: middleware registration order (services → conversations → media groups → commands → callbacks → message handler)
- `src/bot/conversations/` — Multi-turn flows using `@grammyjs/conversations` (onboarding, date input, edit entry)
- `src/bot/handlers/` — Command and callback handlers
- `src/bot/middleware/mediaGroup.ts` — Buffers media group messages (600ms), extracts best-quality photos/videos, creates diary entries
- `src/services/` — Business logic with Prisma transactions and row-level locking for concurrency
- `src/services/transcription.service.ts` — Voice message transcription via OpenAI Whisper API (max 5 min)
- `src/services/tagging.service.ts` — Auto-tagging diary entries via GPT-4o-mini (fire-and-forget)
- `src/services/summary.service.ts` — Monthly diary summary generation via GPT-4o
- `src/config/env.ts` — Zod-validated environment variables
- `src/types/bot.ts` — BotContext, Services, BotConversation type definitions

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
- Services use constructor DI with PrismaClient; domain errors via custom error classes (`DiaryDomainError`, `InviteDomainError`, `TranscriptionError`, `SummaryDomainError`)
- Tests mock Prisma client methods with `vi.fn()` — no real DB in tests

## Deployment

- Dokploy with Traefik reverse proxy, domain: `viki.deazmont.ru`
- Branch `dev` for testing, `main` for production; autodeploy on push
- `docker-compose.dokploy.yml` — production compose; do NOT expose `ports` (Traefik routes via internal Docker network)
- `scripts/entrypoint.sh` — runs Prisma migrations then starts the app
