# Baby Diary Bot (MVP v0.1, Stage 1)

Foundation for a multi-tenant Telegram baby diary bot.

Tech baseline: `Prisma 7`, `TypeScript strict`, `grammY + conversations`, `PostgreSQL`.

## Implemented in Stage 1

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
- Base services:
  - `user.service.ts` (`findOrCreateUser`)
  - `baby.service.ts` (`createBaby`, `getBabyByUser`, `getMembers`)
- Webhook mode with Express.

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

## Notes

- Prisma 7 uses `prisma.config.ts` for datasource and migrations configuration.
- Invite-link acceptance is intentionally deferred to Stage 2.
- `/history`, content ingest, media grouping, and notifications are out of scope for Stage 1.
