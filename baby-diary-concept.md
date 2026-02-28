# 👶 Baby Diary Bot — Концепция проекта

## Идея

Telegram-бот для ведения дневника о малыше. Родители просто кидают в чат текст, фото и видео — бот всё сохраняет. Бот мультитенантный: любой пользователь может создать дневник для своего ребёнка и пригласить других участников через инвайт-ссылку.

---

## Scope: MVP (v0.1)

### Что входит
- Онбординг: создание дневника (имя малыша + дата рождения) с машиной состояний (grammY conversations)
- Приглашение участников через инвайт-ссылку
- Приём контента: текст, фото (с caption), видео
- Корректная обработка media_group (пакетная отправка фото/видео)
- Склейка сообщений одного автора в 10-минутном окне + уведомление «добавлено к записи от 14:30»
- Дата события: по умолчанию сегодня + inline-кнопка «📅 Изменить дату»
- Удаление записи с подтверждением
- Просмотр записей: команда `/history` с пагинацией + кнопка «Показать медиа»
- Уведомления другим участникам дневника о новой записи
- Вежливый отказ на неподдерживаемый контент (стикеры, документы, геолокация и т.д.)

### Реализовано после MVP
- Расшифровка голосовых через Whisper + пост-обработка GPT-4o-mini (v0.2)
- Авто-теги через GPT-4o-mini (v0.2)
- Конспект за месяц `/summary` через GPT-4o (v0.3)
- Редактирование текста записей (v0.3)
- REST API с аутентификацией через Telegram initData (v0.4)
- Telegram Mini App: лента, просмотр записей, создание (текст), редактирование, саммари (v0.4)
- Media proxy для отображения фото/видео в Mini App (v0.4)
- Команда `/app` для открытия Mini App (v0.4)

### Что НЕ реализовано (следующие итерации)
- Фильтрация по тегам
- Дублирование медиа в S3
- Загрузка медиа через Mini App
- Экспорт в PDF
- Несколько малышей у одного пользователя

---

## UX-флоу MVP

### Онбординг

Реализуется через **grammY conversations plugin** — машина состояний, которая корректно обрабатывает невалидный ввод (фото вместо имени и т.п.).

```
Пользователь → /start
  └─► «Привет! Я помогу вести дневник вашего малыша.»
      └─► Кнопки: [Создать дневник] [У меня есть инвайт-ссылка]

Создать дневник:
  └─► «Как зовут малыша?»
      └─► Пользователь вводит имя (если не текст → «Пожалуйста, введите имя текстом»)
          └─► «Когда родился? (дд.мм.гггг)»
              └─► (если невалидная дата → «Введите дату в формате дд.мм.гггг»)
                  └─► Дневник создан! Вот инвайт-ссылка для второго родителя: ...
```

### Приглашение участников

Владелец дневника получает инвайт-ссылку вида `t.me/BabyDiaryBot?start=invite_<token>`. Может переслать кому угодно. При переходе по ссылке новый участник автоматически присоединяется к дневнику.

Инвайт-ссылка многоразовая — можно скинуть в семейный чат. Владелец может перегенерировать через `/invite` если нужно отозвать.

### Создание записей

Пользователь просто отправляет контент в бота → бот сохраняет.

**Поддерживаемый контент:**
- Текстовые сообщения
- Фото (в том числе с caption — подпись сохраняется вместе с фото)
- Видео (в том числе с caption)
- Голосовые сообщения (транскрибируются через Whisper + пост-обработка GPT-4o-mini, макс 5 мин)

**Неподдерживаемый контент:** стикеры, документы, геолокация, контакты и прочее. Бот отвечает: «Пока я умею сохранять только текст, фото, видео и голосовые 😊»

**Обработка media_group:** когда пользователь отправляет несколько фото/видео разом, Telegram шлёт их отдельными сообщениями с одинаковым `media_group_id`. Бот собирает их пачкой (буфер ~500мс после первого сообщения из группы) и сохраняет как один батч. Одно подтверждение на всю группу.

**Склейка:** если с последней записи **того же автора** прошло меньше 10 минут — новое сообщение добавляется к ней. Бот отвечает: «✅ Добавлено к записи от 14:30». Сообщения разных авторов не склеиваются — каждый автор создаёт свои записи.

**Новая запись:** если прошло больше 10 минут или предыдущая запись от другого автора — создаётся новая. Бот отвечает: «✅ Записано на 22.02.2026» + inline-кнопки:
- ✏️ Редактировать
- 📅 Изменить дату
- 🗑 Удалить

### Изменение даты

При нажатии «📅 Изменить дату»:
- Бот предлагает inline-кнопки: [Вчера] [Позавчера] [Ввести дату]
- При выборе «Ввести дату» — ожидает ввод в формате дд.мм.гггг
- После изменения: «📅 Дата записи изменена на 21.02.2026»

### Удаление

При нажатии «🗑 Удалить»:
- Бот спрашивает: «Удалить запись от 22.02.2026? Это действие нельзя отменить.»
- Кнопки: [Да, удалить] [Отмена]

### Просмотр записей

Команда `/history` показывает последние записи, от новых к старым.

Формат одной записи — текст + счётчик медиа:
```
📝 22 февраля 2026 — Сергей

Вика сегодня впервые села сама! 
🖼 2 фото · 🎥 1 видео

[📎 Показать медиа] [◀️ Назад] [Вперёд ▶️]
```

Кнопка «📎 Показать медиа» — отправляет фото/видео из записи отдельными сообщениями. По умолчанию показывается только текстовое превью — это быстрее и легче.

Пагинация: по 1 записи на страницу, навигация кнопками.

### Уведомления участникам

Когда один участник добавляет запись — остальные получают уведомление:
```
📝 Сергей добавил запись в дневник Вики:
«Вика сегодня впервые села сама!»
🖼 2 фото
```

Уведомление содержит превью текста (первые ~100 символов) и количество медиа.

---

## Архитектура MVP

```
Telegram Bot API (webhook)       Telegram Mini App
       │                                │
       ▼                                ▼
   Express 5                      /app/* (статика)
       │
       ├──► POST /telegram/webhook ──► grammY Bot
       │       ├──► conversations (онбординг, ввод даты, редактирование)
       │       ├──► media_group буфер (сбор пакетных фото/видео)
       │       └──► formatters / keyboards / notifications
       │
       ├──► /api/v1/* ──► REST API (auth: Telegram initData HMAC)
       │       ├──► baby, entries, media, summary routes
       │       └──► error handler (domain errors → HTTP)
       │
       └──► Сервисный слой (общий для бота и API)
                ├──► OpenAI API (Whisper, GPT-4o-mini, GPT-4o)
                └──► PostgreSQL через Prisma 7
```

### Принцип: сервисный слой с первого дня

Бизнес-логика живёт в сервисах, а не в хендлерах бота. Хендлеры — тонкие: парсят input из Telegram и вызывают сервисы. REST API роуты вызывают те же самые сервисы — ноль дублирования логики.

```
  Telegram ──► bot/handlers ──┐
                               ├──► services/ ──► db/
  Mini App ──► api/routes ────┘
```

### Структура проекта

```
src/
  api/                  ← REST API слой (v0.4)
    middleware/
      auth.ts           ← валидация Telegram initData (HMAC-SHA256)
      errorHandler.ts   ← маппинг доменных ошибок → HTTP-статусы
    routes/
      baby.routes.ts    ← GET /baby, /baby/members, /baby/invite
      entries.routes.ts ← CRUD для записей дневника
      media.routes.ts   ← прокси медиафайлов из Telegram
      summary.routes.ts ← генерация месячного саммари
    router.ts           ← фабрика API-роутера (монтируется на /api/v1)
    types.ts            ← AuthedRequest, AuthenticatedActor

  bot/                  ← grammY: хендлеры, middleware, conversations
    handlers/
      start.ts          ← /start, онбординг
      diary.ts          ← приём текста, фото, видео
      history.ts        ← /history
      historyCallbacks.ts ← навигация по истории
      invite.ts         ← /invite
      app.ts            ← /app — открытие Mini App
      summary.ts        ← /summary — конспект за месяц
      summaryCallbacks.ts ← навигация по месяцам
      entryCallbacks.ts ← inline-кнопки (дата, удаление, редактирование)
      entryActionErrors.ts ← маппинг доменных ошибок
    middleware/
      mediaGroup.ts     ← буфер для media_group_id
    conversations/
      onboarding.ts     ← диалог создания дневника
      dateInput.ts      ← диалог ввода даты
      editEntry.ts      ← диалог редактирования текста записи
    formatters/
      entry.ts          ← форматирование записей для отображения
    keyboards/
      entryActions.ts   ← клавиатура действий с записью
      history.ts        ← клавиатура пагинации истории
      summary.ts        ← клавиатура навигации по месяцам
    notifications/
      newEntry.ts       ← форматирование уведомлений о новых записях
    bot.ts              ← инициализация бота, подключение хендлеров

  services/             ← бизнес-логика (общая для бота и API)
    diary.service.ts    ← createOrAppend, deleteEntry, getHistory, updateEntryText
    diary.errors.ts     ← DiaryDomainError
    baby.service.ts     ← createBaby, getBabyByUser, getMembers
    user.service.ts     ← findOrCreateUser
    invite.service.ts   ← generateInvite, acceptInvite, regenerateInvite
    invite.errors.ts    ← InviteDomainError
    notification.service.ts ← notifyMembers
    transcription.service.ts ← расшифровка голосовых (Whisper + GPT-4o-mini)
    transcription.errors.ts  ← TranscriptionError
    tagging.service.ts       ← авто-теги (GPT-4o-mini)
    summary.service.ts       ← конспект за месяц (GPT-4o)
    summary.errors.ts        ← SummaryDomainError

  db/                   ← работа с базой
    prisma.ts           ← Prisma client instance
    client.ts           ← CJS→ESM bridge (реэкспорт энамов и PrismaClient)

  config/               ← конфиги, переменные окружения
    env.ts              ← Zod-валидация env
    logger.ts           ← Pino logger

  types/                ← типы
    bot.ts              ← BotContext, Services, BotConversation

  utils/                ← хелперы
    month.ts            ← работа с месяцами
    telegram.ts         ← Telegram-утилиты

  index.ts              ← точка входа (Express + API + Mini App + webhook + services)

miniapp/                ← Telegram Mini App (Vite + React 19 + Tailwind v4)
  src/
    api/
      client.ts         ← API-клиент с TMA-авторизацией
      types.ts          ← TypeScript-типы (Baby, DiaryEntry, etc.)
    components/
      app-context.tsx   ← глобальное состояние, навигация, загрузка данных
      feed-screen.tsx   ← лента записей с карточками и медиа
      detail-screen.tsx ← полный просмотр записи с лайтбоксом
      create-edit-screen.tsx ← создание (текст) и редактирование
      summary-screen.tsx    ← месячный AI-саммари
      bottom-tab-bar.tsx    ← нижняя навигация (3 вкладки)
      telegram-header.tsx   ← шапка с именем малыша
      snackbar.tsx          ← toast-уведомления
    hooks/
      useTelegram.ts    ← хук Telegram WebApp SDK (initData, BackButton, haptics)
    lib/
      format.ts         ← форматирование дат на русском
      utils.ts          ← cn() утилита (clsx + tailwind-merge)
  vite.config.ts        ← base: "/app/", прокси /api → :3000

prisma/
  schema.prisma         ← схема базы данных
```

### Сервисы — контракты

Сервисы принимают и возвращают простые объекты, не зависят от Telegram-типов:

```typescript
// diary.service.ts
createOrAppend(input) → Entry           // создание или склейка в merge window (с row-level locking)
getEntryById(input) → Entry             // получение записи с проверкой доступа
deleteEntry({ entryId, actorId }) → void
getHistory(input) → { entries[], total, page, limit, totalPages }
updateEventDate({ entryId, actorId, eventDate }) → Entry
updateEntryText(input) → Entry          // редактирование текста + перегенерация тегов
getEntriesForDateRange(input) → Entry[] // для /summary
updateTags(entryId, tags) → void

// baby.service.ts
createBaby(name, birthDate, ownerUserId) → Baby
getBabyByUser(userId) → Baby | null
getMembers(babyId) → User[]

// invite.service.ts
generateInvite(babyId) → inviteToken
acceptInvite(token, userId) → Baby
regenerateInvite(babyId) → newToken

// notification.service.ts
notifyOtherMembers(babyId, excludeUserId, message) → void

// transcription.service.ts
transcribe(fileUrl) → string            // Whisper + GPT-4o-mini пост-обработка

// tagging.service.ts
generateTags(text) → string[]           // GPT-4o-mini

// summary.service.ts
generateSummary(input) → string         // GPT-4o
```

---

## Модель данных MVP

### users
| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| telegram_id | BIGINT | Уникальный, Telegram user ID |
| first_name | VARCHAR | Имя из Telegram |
| username | VARCHAR | Username из Telegram (nullable) |
| created_at | TIMESTAMP | |

### babies
| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| name | VARCHAR | Имя малыша |
| birth_date | DATE | Дата рождения |
| invite_token | VARCHAR | Токен для инвайт-ссылки (уникальный) |
| created_at | TIMESTAMP | |

### baby_members
| Поле | Тип | Описание |
|------|-----|----------|
| baby_id | UUID | FK → babies |
| user_id | UUID | FK → users |
| role | ENUM | owner / member |
| created_at | TIMESTAMP | |

### diary_entries
| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| baby_id | UUID | FK → babies |
| author_id | UUID | FK → users |
| event_date | DATE | Дата события (по умолчанию today) |
| tags | TEXT[] | Авто-теги (GPT-4o-mini) |
| merge_window_until | TIMESTAMP | created_at + 10 мин |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### entry_items
| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| entry_id | UUID | FK → diary_entries |
| type | ENUM | text / photo / video / voice |
| text_content | TEXT | Текст сообщения или caption фото/видео (nullable) |
| file_id | VARCHAR | Telegram file_id для медиа (nullable) |
| order_index | INT | Порядок внутри записи |
| created_at | TIMESTAMP | |

**Примечание по caption:** когда пользователь отправляет фото/видео с подписью, caption сохраняется в `text_content` того же entry_item. Отдельный item для caption не создаётся.

---

## Технологический стек MVP

| Компонент | Технология |
|-----------|-----------|
| Runtime | Node.js 22 (ESM) |
| Language | TypeScript 5.9 |
| Bot framework | grammY 1.40 |
| Плагины grammY | conversations 2.1 (онбординг, ввод даты, редактирование) |
| Web framework | Express 5 |
| База данных | PostgreSQL |
| ORM | Prisma 7 |
| AI | OpenAI SDK (Whisper, GPT-4o-mini, GPT-4o) |
| Валидация | Zod 4 |
| Тесты | Vitest 4 |
| Mini App | Vite + React 19 + Tailwind v4 + shadcn/ui |
| Telegram SDK | @telegram-apps/sdk (initData, BackButton, HapticFeedback) |
| Хостинг | Dokploy + Traefik, домен viki.deazmont.ru |

---

## Команды бота MVP

| Команда | Описание |
|---------|----------|
| `/start` | Онбординг: создание дневника или вход по инвайту |
| `/history` | Просмотр записей с пагинацией |
| `/invite` | Показать/перегенерировать инвайт-ссылку (только owner) |
| `/summary` | Конспект за месяц (генерация через GPT-4o, навигация по месяцам) |
| `/app` | Открыть Telegram Mini App для красивого просмотра дневника |

---

## План реализации MVP

### Этап 1 — Фундамент
- [x] Инициализация проекта (Node.js + grammY + Prisma)
- [x] Структура проекта (bot/, services/, db/, config/, utils/)
- [x] Настройка PostgreSQL, создание миграций
- [x] Подключение grammY conversations plugin
- [x] Сервисы: user.service, baby.service
- [x] Команда `/start` + онбординг с валидацией ввода

### Этап 2 — Инвайт-система
- [x] Сервис: invite.service
- [x] Генерация инвайт-ссылки при создании дневника
- [x] Обработка перехода по инвайт-ссылке
- [x] Команда `/invite` для просмотра и перегенерации

### Этап 3 — Приём и хранение записей
- [x] Сервис: diary.service (createEntry, addItemsToEntry, getOpenEntry)
- [x] Middleware: mediaGroup буфер
- [x] Обработка текстовых сообщений → создание записи
- [x] Обработка фото и видео (включая caption) → сохранение file_id
- [x] Логика склейки в 10-минутном окне (только для одного автора)
- [x] Уведомление «добавлено к записи от ...»
- [x] Отказ на неподдерживаемый контент

### Этап 4 — Управление записями
- [x] Сервис: diary.service (deleteEntry, updateEventDate)
- [x] Inline-кнопки после создания записи (дата, удаление)
- [x] Изменение даты события
- [x] Удаление с подтверждением

### Этап 5 — Просмотр и уведомления
- [x] Сервис: diary.service (getHistory), notification.service
- [x] Команда `/history` с пагинацией (текст + счётчик медиа)
- [x] Кнопка «Показать медиа» — отправка фото/видео
- [x] Уведомления другим участникам о новых записях

### Этап 6 — Тестирование и деплой
- [x] Тестирование основных сценариев
- [x] Деплой на VPS
- [x] Настройка webhook / long polling

---

## Дорожная карта после MVP

| Версия | Фичи |
|--------|-------|
| ~~v0.2~~ | ~~Расшифровка голосовых (Whisper + GPT-4o-mini), авто-теги (GPT-4o-mini)~~ — Done |
| ~~v0.3~~ | ~~Конспект за месяц (`/summary` через GPT-4o), редактирование записей~~ — Done |
| ~~v0.4~~ | ~~REST API + Telegram Mini App для красивого просмотра~~ — Done |
| v0.5 | Фильтрация по тегам, дублирование медиа в S3, загрузка медиа в Mini App |
| v1.0 | Экспорт в PDF, несколько малышей у одного пользователя |
