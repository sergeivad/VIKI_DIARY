# v0.4 Design: REST API + Telegram Mini App

## Summary

REST API на Express + Telegram Mini App (Vite + React SPA) для красивого просмотра и управления дневником.
Mini App деплоится вместе с ботом — Express отдаёт статику на `/app/*`, API на `/api/*`.

## Decisions

| Решение | Выбор | Почему |
|---------|-------|--------|
| Фронтенд фреймворк | Vite + React SPA | Лёгкий, быстрый, нет серверного рендера — подходит для TG Mini App |
| Репозиторий | Monorepo (`miniapp/` в VIKI_DIARY) | Общие типы, один CI/CD, один деплой |
| API подход | Плоские REST-роуты на Express | ~8 эндпоинтов, сервисы уже готовы, минимум нового кода |
| Медиа | Proxy через `/api/media/:fileId` | Не нужен S3 (будет в v0.5), Telegram file API |
| Деплой | Express отдаёт статику miniapp | Один Docker-образ, нет CORS, один домен |
| Создание записей | Только текст + дата | Загрузка медиа — вместе с S3 в v0.5 |
| Скоуп | Все 5 экранов | Лента, детали, создание (текст), редактирование, саммари |

## Architecture

```
Telegram Bot API (webhook)
       │
       ▼
   Express 5
       │
       ├──► POST /telegram/webhook → grammY Bot
       ├──► /api/* → REST API (auth via initData)
       │       ├──► entries CRUD
       │       ├──► baby info
       │       ├──► media proxy
       │       └──► summary
       ├──► /app/* → Mini App static files (Vite build)
       └──► /health/* → monitoring
       │
       └──► Services Layer (shared)
               ├──► DiaryService
               ├──► BabyService
               ├──► SummaryService
               └──► ...
```

## REST API Endpoints

| Method | Path | Service call | Description |
|--------|------|-------------|-------------|
| GET | `/api/baby` | `babyService.getBabyByUser` | Baby info + members |
| GET | `/api/entries?page&limit` | `diaryService.getHistory` | Paginated feed |
| GET | `/api/entries/:id` | `diaryService.getEntryById` | Single entry with items |
| POST | `/api/entries` | `diaryService.createOrAppend` | Create text entry |
| PATCH | `/api/entries/:id` | `updateEntryText + updateEventDate` | Edit entry |
| DELETE | `/api/entries/:id` | `diaryService.deleteEntry` | Delete entry |
| GET | `/api/media/:fileId` | Telegram Bot API proxy | Stream media file |
| GET | `/api/summary?month&year` | `summaryService.generateSummary` | Monthly AI summary |

## Authentication

Telegram Mini App initData validation:

1. Mini App reads `window.Telegram.WebApp.initData` on startup
2. Sends it as `X-Telegram-Init-Data` header with every request
3. Auth middleware validates HMAC signature using bot token
4. Extracts Telegram user ID → finds/creates user via `userService`
5. Sets `req.user` for route handlers

## Monorepo Structure

```
VIKI_DIARY/
├── src/                         ← backend
│   ├── api/                     ← NEW: REST API layer
│   │   ├── routes/
│   │   │   ├── baby.routes.ts
│   │   │   ├── entries.routes.ts
│   │   │   ├── media.routes.ts
│   │   │   └── summary.routes.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts          ← initData HMAC validation
│   │   │   └── errorHandler.ts  ← domain errors → HTTP responses
│   │   └── router.ts            ← Express Router mounted at /api
│   ├── bot/                     ← existing bot (unchanged)
│   ├── services/                ← existing services (shared)
│   └── index.ts                 ← adds app.use('/api', apiRouter)
├── miniapp/                     ← NEW: Vite + React SPA
│   ├── src/
│   │   ├── api/                 ← API client (fetch wrappers)
│   │   ├── components/          ← migrated from prototype
│   │   ├── hooks/               ← useTelegram, useApi
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── package.json                 ← root with workspaces
└── Dockerfile                   ← builds both backend and frontend
```

## Frontend Migration from Prototype

### Keep as-is
- 5 screens: feed, detail, create, edit, summary
- shadcn/ui components
- Warm children's palette (CSS custom properties)
- Nunito font
- Skeleton loading states

### Change
- Mock data → real API calls via fetch
- Add `@telegram-apps/sdk` for Telegram WebApp integration
- Photo/video URLs → `/api/media/:fileId`
- Create screen: text + date only (no media upload in v0.4)
- Author data from real API (not hardcoded)

## Media Proxy

`GET /api/media/:fileId`:
1. Calls Telegram `getFile(fileId)` → gets `file_path`
2. Streams file from `https://api.telegram.org/file/bot{TOKEN}/{file_path}`
3. Sets correct `Content-Type` header
4. Caches file_path lookups (Telegram file_id → file_path doesn't change)

Future (v0.5): Replace with S3 URLs — frontend doesn't change, only the API endpoint implementation.

## Error Handling

- Domain errors (`DiaryDomainError`, etc.) → mapped to HTTP 400/403/404
- Auth errors → 401
- Unexpected errors → 500 with generic message
- Frontend shows toast/snackbar on errors (already in prototype)

## Testing

- API routes: unit tests with mock services
- Auth middleware: initData HMAC validation tests
- Frontend: no tests in v0.4

## Future Compatibility

| Future feature | Impact on v0.4 architecture |
|---|---|
| v0.5: S3 media | Change media route implementation only |
| v0.5: Tag filters | Add `?tags=` query param to GET /api/entries |
| v1.0: Multiple babies | Add GET /api/babies, miniapp adds baby selector |
| v1.0: PDF export | Add GET /api/export/pdf route |
| Separate frontend deploy | Remove express.static, add CORS — no code changes |
