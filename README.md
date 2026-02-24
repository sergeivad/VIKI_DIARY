# Baby Diary Bot

Multi-tenant Telegram baby diary bot.

Tech baseline: `Prisma 7`, `TypeScript strict`, `grammY + conversations`, `PostgreSQL`.

## Implemented

- TypeScript strict project setup.
- PostgreSQL via Docker Compose.
- Prisma schema + migrations for:
  - `users`
  - `babies`
  - `baby_members`
- `grammY` bot with `@grammyjs/conversations`.
- `/start` onboarding flow:
  - baby name validation (text only)
  - birth date validation (`dd.mm.yyyy`)
- Invite system (Stage 2):
  - invite-link acceptance via `/start invite_<token>`
  - `/invite` command for owner
  - `/invite regenerate` to rotate invite token
- Diary ingest (Stage 3):
  - text/photo/video/voice message handling
  - voice messages: transcription via OpenAI Whisper (max 5 min)
  - media-group buffering with single batch save
  - 10-minute merge window for the same author (UTC today)
  - unsupported content fallback message (stickers, documents, etc.)
- Auto-tags (Stage 7):
  - automatic tagging of diary entries via Claude Haiku (fire-and-forget)
- Entry management (Stage 4):
  - inline actions after new entry: change date / delete
  - quick event date change: yesterday / day before yesterday
  - manual event date input via conversation
  - delete flow with inline confirmation
- History and notifications (Stage 5):
  - `/history` with single-entry pagination
  - preview page with text + media counters
  - inline navigation (`◀️ Назад` / `Вперёд ▶️`)
  - `📎 Показать медиа` callback to send entry photos/videos
  - member notifications for newly created entries
- Testing and deploy readiness (Stage 6):
  - Dockerized app (`Dockerfile`, `.dockerignore`, `scripts/entrypoint.sh`)
  - Dokploy compose file (`docker-compose.dokploy.yml`)
  - health endpoints: `/health/live`, `/health/ready`
  - deployment smoke script (`npm run smoke:deploy`)
- Base services:
  - `user.service.ts` (`findOrCreateUser`)
  - `baby.service.ts` (`createBaby`, `getBabyByUser`, `getMembers`)
  - `invite.service.ts` (`acceptInvite`, `regenerateInvite`, `generateInvite`)
  - `diary.service.ts` (`createEntry`, `addItemsToEntry`, `getOpenEntry`, `createOrAppend`, `getHistory`)
  - `notification.service.ts` (`notifyOtherMembers`)
  - `transcription.service.ts` (voice message transcription via Whisper)
  - `tagging.service.ts` (auto-tagging via Claude Haiku)
- Webhook-only production mode with Express.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment file and fill values:

```bash
cp .env.example .env
```

3. Start Postgres:

```bash
npm run db:up
```

4. Generate Prisma client and apply migration:

```bash
npm run prisma:generate
npm run prisma:migrate:dev -- --name init_stage1
```

5. Run bot server:

```bash
npm run dev
```

## Webhook

The app starts an Express server and mounts Telegram webhook at `WEBHOOK_PATH`.

- Set webhook manually:

```bash
npm run webhook:set
```

- Delete webhook:

```bash
npm run webhook:delete
```

## Useful Scripts

- `npm run dev` - run in watch mode.
- `npm run build` - compile TypeScript.
- `npm run start` - run compiled app.
- `npm run test` - run tests.
- `npm run lint` - run ESLint.
- `npm run smoke:deploy -- https://your-domain.com` - verify live/ready + webhook.

## Health Endpoints

- `GET /health` - legacy liveness endpoint (always 200 if process is up).
- `GET /health/live` - liveness endpoint for container health checks.
- `GET /health/ready` - readiness endpoint (checks DB connectivity).

## Deploy to VPS with Dokploy

Detailed runbook: `docs/deploy-dokploy.md`.

### 1. Prepare Dokploy project

1. Connect repository and set branch (`dev` or your release branch).
2. Choose compose file: `docker-compose.dokploy.yml`.
3. Configure domain with TLS in Dokploy (required by Telegram webhook).

### 2. Configure environment variables

Required app env:

- `BOT_TOKEN`
- `BOT_USERNAME`
- `WEBHOOK_SECRET`
- `WEBHOOK_URL` (must include webhook path, e.g. `https://bot.example.com/telegram/webhook`)
- `OPENAI_API_KEY` (for voice transcription via Whisper)
- `ANTHROPIC_API_KEY` (for auto-tagging via Claude Haiku)

Optional app env:

- `WEBHOOK_PATH` (default `/telegram/webhook`)
- `LOG_LEVEL` (default `info`)
- `PORT` (default `3000`)
- `DATABASE_URL` (override if you use an external DB; compose builds it from Postgres vars by default)

Postgres env:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Example `DATABASE_URL` for compose service:

```text
postgresql://postgres:<password>@postgres:5432/baby_diary?schema=public
```

### 3. Deploy flow

1. Dokploy builds image from `Dockerfile`.
2. Container entrypoint runs `prisma migrate deploy`.
3. App starts and sets Telegram webhook automatically at startup.
4. Dokploy health-check uses `GET /health/live`.

### 4. Post-deploy verification

Run smoke checks:

```bash
SMOKE_BASE_URL=https://bot.example.com BOT_TOKEN=... WEBHOOK_URL=https://bot.example.com/telegram/webhook npm run smoke:deploy
```

Or pass base URL as an argument:

```bash
BOT_TOKEN=... WEBHOOK_URL=https://bot.example.com/telegram/webhook npm run smoke:deploy -- https://bot.example.com
```

Smoke script validates:

- `GET /health/live`
- `GET /health/ready`
- Telegram `getWebhookInfo` (URL match, no `last_error_message`)

## Notes

- Prisma 7 uses `prisma.config.ts` for datasource and migrations configuration.
- `BOT_USERNAME` is required to build invite links (`https://t.me/<bot_username>?start=invite_<token>`).
- Production deploy is webhook-only (long polling is not used).
