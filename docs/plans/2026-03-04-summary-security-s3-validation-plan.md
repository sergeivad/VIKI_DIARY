# Summary Vision Security + S3 Coverage + Media Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Устранить утечку `BOT_TOKEN` в vision-потоке, вернуть S3-фото в обогащение summary и добавить runtime-валидацию `media[].type`, чтобы некорректный payload не приводил к 500.

**Architecture:** Перевести vision-вход с внешних URL на серверно-сформированные Data URL (base64) из Telegram/S3-байтов, чтобы токены и секреты не уходили во внешний API. Унифицировать сбор фото в bot/API summary-потоках: включать `photo` из обоих источников (`fileId` и `s3Key`) и маппить описания обратно по стабильному локальному ключу. В `entries`-роутах добавить явную runtime-валидацию допустимых типов медиа до передачи в `DiaryService`.

**Tech Stack:** TypeScript, Express, Grammy, OpenAI Chat Completions Vision (`gpt-4o-mini`), AWS SDK S3, Vitest, Supertest

---

### Task 1: Зафиксировать новый контракт для vision-описания фото (без внешних URL)

**Files:**
- Modify: `src/services/summary.service.ts`
- Modify: `tests/services/summary.service.test.ts`

**Step 1: Write failing tests for new `describePhotos` input contract**

В `tests/services/summary.service.test.ts` добавить/обновить тесты, где `describePhotos` принимает массив объектов вида:

```ts
{ key: string; mimeType: string; data: Buffer }
```

Ожидания:
- результат маппится по `key`, а не по URL;
- в OpenAI уходит `image_url` с `data:<mime>;base64,...`;
- при ошибке одного фото остальные не теряются.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/services/summary.service.test.ts`
Expected: FAIL на сигнатуре/ожиданиях `describePhotos`.

**Step 3: Implement minimal contract change in service**

В `src/services/summary.service.ts`:
- ввести тип входа для vision-фото (`key`, `mimeType`, `data`);
- внутри `describePhotos` конвертировать `Buffer` в Data URL;
- логировать и пропускать только неуспешные элементы;
- возвращать `Map<key, description>`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/services/summary.service.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/summary.service.ts tests/services/summary.service.test.ts
git commit -m "fix(summary): use server-side image bytes for vision inputs"
```

---

### Task 2: Добавить безопасный загрузчик фото из Telegram/S3 для summary (API + Bot)

**Files:**
- Modify: `src/index.ts`
- Modify: `src/api/router.ts`
- Modify: `src/api/routes/summary.routes.ts`
- Modify: `src/bot/handlers/summary.ts`
- Modify: `src/types/bot.ts`
- Modify: `src/services/s3.service.ts`
- Test: `tests/api/routes/summary.routes.test.ts`
- Create: `tests/bot/summary.handler.test.ts`

**Step 1: Write failing route test for S3-backed photo coverage**

В `tests/api/routes/summary.routes.test.ts` добавить кейс:
- запись содержит `photo` с `fileId = null`, `s3Key != null`;
- `summaryService.describePhotos` вызывается с этим фото;
- в `entriesText` появляется `[Фото: ...]` для S3-фото.

**Step 2: Write failing route test for Telegram token safety**

В том же файле добавить кейс:
- `describePhotos` получает бинарный input (через новый контракт), а не Telegram URL;
- нигде в аргументах `describePhotos` нет строки с `bot`/`BOT_TOKEN`.

**Step 3: Run route tests to verify failures**

Run: `npm test -- tests/api/routes/summary.routes.test.ts`
Expected: FAIL (текущее поведение использует URL и фильтр только по `fileId`).

**Step 4: Implement Telegram byte loader and wire into API summary route**

В `src/index.ts`:
- оставить существующий `getFileUrl` только для media-proxy;
- добавить `getTelegramPhotoData(fileId)` -> `{ data: Buffer, mimeType: string }` через `bot.api.getFile(...)` + `fetch(...)`.

В `src/api/router.ts` и `src/api/routes/summary.routes.ts`:
- прокинуть новый loader в summary-router;
- при сборе фото включать `item.type === "photo" && (item.fileId || item.s3Key)`;
- Telegram-фото грузить через `getTelegramPhotoData`;
- S3-фото грузить через `s3Service` (см. следующий шаг);
- в `describePhotos` передавать объекты нового контракта.

**Step 5: Implement S3 object download helper**

В `src/services/s3.service.ts` добавить метод загрузки объекта:

```ts
getObjectData(s3Key): Promise<{ data: Buffer; mimeType: string | null }>
```

Использовать `GetObjectCommand`, читать body в `Buffer`, возвращать `ContentType`.

**Step 6: Mirror same logic in bot summary handler**

В `src/bot/handlers/summary.ts`:
- убрать построение Telegram URL с `BOT_TOKEN`;
- использовать Telegram byte loader (`ctx.api.getFile` + `fetch`) и новый контракт `describePhotos`;
- включить в pipeline S3-фото (`s3Key`) из entries.

В `src/types/bot.ts` расширить `Services` полем `s3Service: S3Service | null`, чтобы bot handler имел доступ к S3.

**Step 7: Add bot handler regression tests**

Создать `tests/bot/summary.handler.test.ts`:
- кейс на отсутствие URL с токеном в вызове `describePhotos`;
- кейс на S3-фото (`s3Key`) в summary enrichment;
- кейс graceful skip при ошибке загрузки одного фото.

**Step 8: Run focused tests**

Run:

```bash
npm test -- tests/api/routes/summary.routes.test.ts tests/bot/summary.handler.test.ts
```

Expected: PASS.

**Step 9: Commit**

```bash
git add src/index.ts src/api/router.ts src/api/routes/summary.routes.ts src/bot/handlers/summary.ts src/types/bot.ts src/services/s3.service.ts tests/api/routes/summary.routes.test.ts tests/bot/summary.handler.test.ts
git commit -m "fix(summary): support telegram+s3 photos without leaking bot token"
```

---

### Task 3: Добавить runtime-валидацию media type в entries routes

**Files:**
- Modify: `src/api/routes/entries.routes.ts`
- Test: `tests/api/routes/entries.routes.test.ts`

**Step 1: Write failing tests for invalid media type**

В `tests/api/routes/entries.routes.test.ts` добавить:
- `POST /entries` с `media: [{ type: "gif", s3Key: "x" }]` -> `400`;
- `POST /entries/:id/media` с `type: "gif"` -> `400`.

Проверять, что `diaryService.createEntry/addItemsToEntry` не вызываются.

**Step 2: Run tests to verify failure**

Run: `npm test -- tests/api/routes/entries.routes.test.ts`
Expected: FAIL (сейчас route пропускает тип дальше).

**Step 3: Implement explicit validation in route layer**

В `src/api/routes/entries.routes.ts`:
- добавить helper `isSupportedMediaType(type): type is "photo" | "video"`;
- перед `items.push` / `media.map` валидировать `type`;
- при невалидном типе возвращать `400` с понятным сообщением (`"unsupported media type"`).

**Step 4: Run tests to verify pass**

Run: `npm test -- tests/api/routes/entries.routes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/api/routes/entries.routes.ts tests/api/routes/entries.routes.test.ts
git commit -m "fix(api): validate media types in entries routes"
```

---

### Task 4: End-to-end verification before completion

**Files:**
- Modify: none
- Verify: existing codebase

**Step 1: Run full targeted suite for touched areas**

Run:

```bash
npm test -- tests/services/summary.service.test.ts tests/api/routes/summary.routes.test.ts tests/bot/summary.handler.test.ts tests/api/routes/entries.routes.test.ts
```

Expected: all PASS.

**Step 2: Run project lint/build sanity checks**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS без новых ошибок.

**Step 3: Manual smoke of summary generation flows**

Проверить 2 сценария локально/стейджинг:
- месяц только с miniapp S3-фото;
- месяц со смешанными Telegram + S3 фото.

Ожидания:
- фото-описания попадают в summary;
- в логах/трассировках нет URL с `bot<token>` в исходящих запросах к OpenAI.

**Step 4: Final status**

Подготовить короткий changelog по трем исправлениям и указать прогоны тестов/линта/сборки.
