# Deploy Checklist (Dokploy + VPS)

## Prerequisites

- Domain with DNS pointed to VPS.
- Dokploy installed and reachable.
- Telegram bot token and bot username.

## Services

- App service from `docker-compose.dokploy.yml`.
- Postgres service from the same compose file.

## Required env

- `BOT_TOKEN`
- `BOT_USERNAME`
- `WEBHOOK_SECRET`
- `WEBHOOK_URL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `POSTGRES_PASSWORD`

`DATABASE_URL` is auto-built in `docker-compose.dokploy.yml` from Postgres env values. Set it explicitly only if you use external PostgreSQL.

Recommended `DATABASE_URL`:

```text
postgresql://postgres:<password>@postgres:5432/baby_diary?schema=public
```

## Release steps

1. Push changes to configured branch.
2. Wait for Dokploy auto-deploy to finish.
3. Check logs for:
   - `Applying Prisma migrations...`
   - `Server started`
   - `Webhook is set`
4. Run smoke checks:

```bash
SMOKE_BASE_URL=https://bot.example.com BOT_TOKEN=<token> WEBHOOK_URL=https://bot.example.com/telegram/webhook npm run smoke:deploy
```

## Rollback

1. Re-deploy previous commit/image from Dokploy.
2. Run smoke checks again.

## Admin: reset diary by Telegram ID

After deploying a build that includes `src/admin/resetDiary.ts`, run the reset from the `app` container so it uses the same `DATABASE_URL` as production.

1. Find the app container on the VPS:

```bash
docker ps --format '{{.ID}}\t{{.Names}}' | grep app
```

2. Run the compiled CLI inside that container:

```bash
docker exec -it <app-container-name> npm run diary:reset:dist -- 5702901984
```

Expected output:

```text
Deleted diary "<baby-name>" (<baby-id>) for Telegram user 5702901984. Members: <n>, entries: <n>, summaries: <n>.
```

Notes:
- The command deletes the entire diary by removing the related `babies` row; Prisma cascade then removes members, entries, entry items, and summaries.
- The `users` row is kept, so the Telegram user can onboard again and create a new diary.
- If the command prints `Diary not found for Telegram user ...`, that user does not currently belong to a diary in this environment.
