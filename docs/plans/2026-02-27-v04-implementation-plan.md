# v0.4 Implementation Plan: REST API + Telegram Mini App

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add REST API layer to VIKI_DIARY and create a Vite+React Mini App that connects to it, giving users a beautiful diary viewing/editing experience inside Telegram.

**Architecture:** Express serves REST API on `/api/v1/*` and Mini App static files on `/app/*`. Auth via Telegram initData HMAC validation. Services layer is shared between bot handlers and API routes. Media files proxied from Telegram file API.

**Tech Stack:** Express 5, node:crypto (initData HMAC), Vite + React 19 + Tailwind v4 + shadcn/ui, @telegram-apps/sdk

**Design doc:** `docs/plans/2026-02-27-v04-rest-api-miniapp-design.md`

---

## Phase 1: REST API Backend

### Task 1: API Types and Auth Middleware

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/middleware/auth.ts`
- Test: `tests/api/middleware/auth.test.ts`

**Step 1: Write the auth middleware test**

```typescript
// tests/api/middleware/auth.test.ts
import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../../src/api/middleware/auth.js";

function createInitData(botToken: string, user: object, overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "test-query",
    ...overrides,
  });

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
const TG_USER = { id: 12345, first_name: "Test", username: "testuser" };

const mockUserService = {
  findOrCreateUser: vi.fn().mockResolvedValue({ id: "uuid-1", telegramId: BigInt(12345), firstName: "Test", username: "testuser" }),
};

function mockReqResNext(authHeader?: string) {
  const req = { headers: { authorization: authHeader } } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe("auth middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes valid initData and sets req.actor", async () => {
    const initData = createInitData(BOT_TOKEN, TG_USER);
    const middleware = createAuthMiddleware(mockUserService as any, BOT_TOKEN);
    const { req, res, next } = mockReqResNext(`tma ${initData}`);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).actor.userId).toBe("uuid-1");
    expect((req as any).actor.telegramId).toBe(BigInt(12345));
  });

  it("rejects missing authorization header", async () => {
    const middleware = createAuthMiddleware(mockUserService as any, BOT_TOKEN);
    const { req, res, next } = mockReqResNext(undefined);

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid hash", async () => {
    const initData = createInitData(BOT_TOKEN, TG_USER);
    const tampered = initData.replace(/hash=[^&]+/, "hash=deadbeef");
    const middleware = createAuthMiddleware(mockUserService as any, BOT_TOKEN);
    const { req, res, next } = mockReqResNext(`tma ${tampered}`);

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects expired initData", async () => {
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - 7200);
    const initData = createInitData(BOT_TOKEN, TG_USER, { auth_date: oldAuthDate });
    const middleware = createAuthMiddleware(mockUserService as any, BOT_TOKEN);
    const { req, res, next } = mockReqResNext(`tma ${initData}`);

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/middleware/auth.test.ts`
Expected: FAIL — module `../../src/api/middleware/auth.js` not found

**Step 3: Create API types**

```typescript
// src/api/types.ts
import type { Request } from "express";

export interface AuthenticatedActor {
  telegramId: bigint;
  userId: string;
}

export interface AuthedRequest extends Request {
  actor: AuthenticatedActor;
}
```

**Step 4: Write auth middleware implementation**

```typescript
// src/api/middleware/auth.ts
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { UserService } from "../../services/user.service.js";
import type { AuthedRequest } from "../types.js";

export function createAuthMiddleware(userService: UserService, botToken: string) {
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("tma ")) {
      res.status(401).json({ error: "Missing Telegram initData" });
      return;
    }

    const initData = header.slice(4);
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      res.status(401).json({ error: "Missing hash" });
      return;
    }

    params.delete("hash");
    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (expected !== hash) {
      res.status(401).json({ error: "Invalid initData signature" });
      return;
    }

    const authDate = Number(params.get("auth_date") ?? 0);
    if (Date.now() / 1000 - authDate > 3600) {
      res.status(401).json({ error: "initData expired" });
      return;
    }

    const userParam = params.get("user");
    if (!userParam) {
      res.status(401).json({ error: "No user in initData" });
      return;
    }

    let tgUser: { id: number; first_name: string; username?: string };
    try {
      tgUser = JSON.parse(userParam) as typeof tgUser;
    } catch {
      res.status(401).json({ error: "Invalid user JSON" });
      return;
    }

    const user = await userService.findOrCreateUser({
      telegramId: BigInt(tgUser.id),
      firstName: tgUser.first_name,
      username: tgUser.username ?? null,
    });

    (req as AuthedRequest).actor = {
      telegramId: BigInt(tgUser.id),
      userId: user.id,
    };

    next();
  };
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/api/middleware/auth.test.ts`
Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add src/api/types.ts src/api/middleware/auth.ts tests/api/middleware/auth.test.ts
git commit -m "feat(api): add Telegram initData auth middleware with tests"
```

---

### Task 2: API Error Handler Middleware

**Files:**
- Create: `src/api/middleware/errorHandler.ts`
- Test: `tests/api/middleware/errorHandler.test.ts`

**Step 1: Write the error handler test**

```typescript
// tests/api/middleware/errorHandler.test.ts
import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { apiErrorHandler } from "../../src/api/middleware/errorHandler.js";
import { DiaryDomainError, DiaryErrorCode } from "../../src/services/diary.errors.js";
import { InviteDomainError, InviteErrorCode } from "../../src/services/invite.errors.js";
import { SummaryDomainError, SummaryErrorCode } from "../../src/services/summary.errors.js";

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = vi.fn() as NextFunction;

describe("apiErrorHandler", () => {
  it("maps ENTRY_NOT_FOUND to 404", () => {
    const err = new DiaryDomainError(DiaryErrorCode.entryNotFound, "Not found");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps ENTRY_ACCESS_DENIED to 403", () => {
    const err = new DiaryDomainError(DiaryErrorCode.entryAccessDenied, "Denied");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("maps INVITE_TOKEN_INVALID to 400", () => {
    const err = new InviteDomainError(InviteErrorCode.inviteTokenInvalid, "Bad token");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps NO_ENTRIES summary error to 422", () => {
    const err = new SummaryDomainError(SummaryErrorCode.noEntries, "No entries");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("returns 500 for unknown errors", () => {
    const err = new Error("Boom");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/middleware/errorHandler.test.ts`
Expected: FAIL — module not found

**Step 3: Write error handler implementation**

```typescript
// src/api/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from "express";
import { DiaryDomainError, DiaryErrorCode } from "../../services/diary.errors.js";
import { InviteDomainError, InviteErrorCode } from "../../services/invite.errors.js";
import { SummaryDomainError, SummaryErrorCode } from "../../services/summary.errors.js";
import { logger } from "../../config/logger.js";

const diaryCodeToHttp: Record<string, number> = {
  [DiaryErrorCode.entryNotFound]: 404,
  [DiaryErrorCode.entryAccessDenied]: 403,
  [DiaryErrorCode.invalidItems]: 422,
  [DiaryErrorCode.invalidEventDate]: 422,
};

const inviteCodeToHttp: Record<string, number> = {
  [InviteErrorCode.inviteTokenInvalid]: 400,
  [InviteErrorCode.userAlreadyInDiary]: 409,
  [InviteErrorCode.babyMembershipNotFound]: 404,
  [InviteErrorCode.ownerRequired]: 403,
  [InviteErrorCode.inviteTokenGenerationFailed]: 500,
};

const summaryCodeToHttp: Record<string, number> = {
  [SummaryErrorCode.noEntries]: 422,
  [SummaryErrorCode.generationFailed]: 502,
};

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DiaryDomainError) {
    res.status(diaryCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof InviteDomainError) {
    res.status(inviteCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SummaryDomainError) {
    res.status(summaryCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  logger.error({ err }, "Unhandled API error");
  res.status(500).json({ error: "Internal server error" });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/middleware/errorHandler.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/api/middleware/errorHandler.ts tests/api/middleware/errorHandler.test.ts
git commit -m "feat(api): add error handler middleware mapping domain errors to HTTP"
```

---

### Task 3: Baby Routes

**Files:**
- Create: `src/api/routes/baby.routes.ts`
- Test: `tests/api/routes/baby.routes.test.ts`

**Context:** BabyService methods — `getBabyByUser(userId)` returns `Baby | null`, `getMembers(babyId)` returns `User[]`. InviteService — `getInviteInfoForUser(userId)` returns `{ babyId, babyName, role, inviteToken } | null`, `regenerateInvite(babyId, userId)` returns new token string, `buildInviteLink(token)` returns URL string.

**Step 1: Write tests for baby routes**

```typescript
// tests/api/routes/baby.routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createBabyRouter } from "../../src/api/routes/baby.routes.js";

const mockBabyService = {
  getBabyByUser: vi.fn(),
  getMembers: vi.fn(),
};

const mockInviteService = {
  getInviteInfoForUser: vi.fn(),
  regenerateInvite: vi.fn(),
  buildInviteLink: vi.fn((token: string) => `https://t.me/TestBot?start=invite_${token}`),
};

function createApp() {
  const app = express();
  app.use(express.json());
  // Fake auth middleware — sets req.actor
  app.use((req, _res, next) => {
    (req as any).actor = { telegramId: BigInt(12345), userId: "user-1" };
    next();
  });
  app.use("/baby", createBabyRouter(mockBabyService as any, mockInviteService as any));
  return app;
}

describe("baby routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /baby returns baby info", async () => {
    mockBabyService.getBabyByUser.mockResolvedValue({
      id: "baby-1", name: "Вика", birthDate: new Date("2025-01-15"),
    });
    const res = await request(createApp()).get("/baby");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Вика");
  });

  it("GET /baby returns 404 when no baby", async () => {
    mockBabyService.getBabyByUser.mockResolvedValue(null);
    const res = await request(createApp()).get("/baby");
    expect(res.status).toBe(404);
  });

  it("GET /baby/members returns members list", async () => {
    mockBabyService.getBabyByUser.mockResolvedValue({ id: "baby-1" });
    mockBabyService.getMembers.mockResolvedValue([
      { id: "user-1", firstName: "Серёжа" },
      { id: "user-2", firstName: "Настя" },
    ]);
    const res = await request(createApp()).get("/baby/members");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
```

**Step 2: Install supertest (needed for route testing)**

Run: `npm install -D supertest @types/supertest`

**Step 3: Run test to verify it fails**

Run: `npm test -- tests/api/routes/baby.routes.test.ts`
Expected: FAIL — module not found

**Step 4: Write baby routes implementation**

```typescript
// src/api/routes/baby.routes.ts
import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { BabyService } from "../../services/baby.service.js";
import type { InviteService } from "../../services/invite.service.js";
import type { AuthedRequest } from "../types.js";

export function createBabyRouter(babyService: BabyService, inviteService: InviteService): Router {
  const router = Router();

  router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "No baby diary found" });
        return;
      }
      res.json(baby);
    } catch (err) {
      next(err);
    }
  });

  router.get("/members", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "No baby diary found" });
        return;
      }
      const members = await babyService.getMembers(baby.id);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  router.get("/invite", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const info = await inviteService.getInviteInfoForUser(actor.userId);
      if (!info) {
        res.status(404).json({ error: "No baby diary found" });
        return;
      }
      const inviteLink = inviteService.buildInviteLink(info.inviteToken);
      res.json({ inviteLink, role: info.role, babyName: info.babyName });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invite/regenerate", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "No baby diary found" });
        return;
      }
      const token = await inviteService.regenerateInvite(baby.id, actor.userId);
      const inviteLink = inviteService.buildInviteLink(token);
      res.json({ inviteLink });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/api/routes/baby.routes.test.ts`
Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add src/api/routes/baby.routes.ts tests/api/routes/baby.routes.test.ts
git commit -m "feat(api): add baby routes (GET /baby, /baby/members, /baby/invite)"
```

---

### Task 4: Entries Routes

**Files:**
- Create: `src/api/routes/entries.routes.ts`
- Test: `tests/api/routes/entries.routes.test.ts`

**Context:** DiaryService methods — see types at `src/services/diary.service.ts:9-93`. Key methods: `getHistory(GetHistoryInput)`, `getEntryById(GetEntryByIdInput)`, `createEntry(CreateEntryInput)`, `updateEntryText(UpdateEntryTextInput)`, `updateEventDate(UpdateEventDateInput)`, `deleteEntry(DeleteEntryInput)`, `updateTags(entryId, tags[])`. Also needs `TaggingService.generateTags(text)` for fire-and-forget tagging on create.

**Step 1: Write tests for entries routes**

```typescript
// tests/api/routes/entries.routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createEntriesRouter } from "../../src/api/routes/entries.routes.js";

const mockDiaryService = {
  getHistory: vi.fn(),
  getEntryById: vi.fn(),
  createEntry: vi.fn(),
  updateEntryText: vi.fn(),
  updateEventDate: vi.fn(),
  deleteEntry: vi.fn(),
  updateTags: vi.fn(),
};

const mockTaggingService = {
  generateTags: vi.fn().mockResolvedValue(["#первый-раз"]),
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { telegramId: BigInt(12345), userId: "user-1" };
    next();
  });
  app.use("/entries", createEntriesRouter(mockDiaryService as any, mockTaggingService as any));
  return app;
}

const ENTRY = {
  id: "entry-1",
  babyId: "baby-1",
  authorId: "user-1",
  eventDate: new Date("2026-02-27"),
  tags: [],
  items: [{ id: "item-1", type: "text", textContent: "Hello", fileId: null, orderIndex: 0 }],
  createdAt: new Date(),
  updatedAt: new Date(),
  mergeWindowUntil: new Date(),
};

describe("entries routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET / returns paginated history", async () => {
    mockDiaryService.getHistory.mockResolvedValue({
      entries: [ENTRY], total: 1, page: 1, limit: 20, totalPages: 1,
    });
    const res = await request(createApp()).get("/entries?babyId=baby-1&page=1&limit=20");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(mockDiaryService.getHistory).toHaveBeenCalledWith({
      babyId: "baby-1", actorId: "user-1", page: 1, limit: 20,
    });
  });

  it("GET /:id returns single entry", async () => {
    mockDiaryService.getEntryById.mockResolvedValue(ENTRY);
    const res = await request(createApp()).get("/entries/entry-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("entry-1");
  });

  it("POST / creates a text entry", async () => {
    mockDiaryService.createEntry.mockResolvedValue(ENTRY);
    const res = await request(createApp())
      .post("/entries")
      .send({ babyId: "baby-1", text: "First steps!", eventDate: "2026-02-27" });
    expect(res.status).toBe(201);
    expect(mockDiaryService.createEntry).toHaveBeenCalled();
  });

  it("PATCH /:id/text updates entry text", async () => {
    mockDiaryService.updateEntryText.mockResolvedValue({ ...ENTRY, items: [{ ...ENTRY.items[0], textContent: "Updated" }] });
    const res = await request(createApp())
      .patch("/entries/entry-1/text")
      .send({ text: "Updated" });
    expect(res.status).toBe(200);
  });

  it("PATCH /:id/date updates entry date", async () => {
    mockDiaryService.updateEventDate.mockResolvedValue({ ...ENTRY, eventDate: new Date("2026-02-26") });
    const res = await request(createApp())
      .patch("/entries/entry-1/date")
      .send({ eventDate: "2026-02-26" });
    expect(res.status).toBe(200);
  });

  it("DELETE /:id deletes entry", async () => {
    mockDiaryService.deleteEntry.mockResolvedValue(undefined);
    const res = await request(createApp()).delete("/entries/entry-1");
    expect(res.status).toBe(204);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/routes/entries.routes.test.ts`
Expected: FAIL — module not found

**Step 3: Write entries routes implementation**

```typescript
// src/api/routes/entries.routes.ts
import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { DiaryService } from "../../services/diary.service.js";
import type { TaggingService } from "../../services/tagging.service.js";
import type { AuthedRequest } from "../types.js";

export function createEntriesRouter(diaryService: DiaryService, taggingService: TaggingService): Router {
  const router = Router();

  // GET /entries?babyId=&page=&limit=
  router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const babyId = req.query.babyId as string;
      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 20, 100);

      if (!babyId) {
        res.status(400).json({ error: "babyId query parameter is required" });
        return;
      }

      const result = await diaryService.getHistory({ babyId, actorId: actor.userId, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /entries/:id
  router.get("/:id", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const entry = await diaryService.getEntryById({ entryId: req.params.id, actorId: actor.userId });
      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // POST /entries  { babyId, text, eventDate? }
  router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { babyId, text, eventDate } = req.body as { babyId: string; text: string; eventDate?: string };

      if (!babyId || !text) {
        res.status(400).json({ error: "babyId and text are required" });
        return;
      }

      const entry = await diaryService.createEntry({
        babyId,
        authorId: actor.userId,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        items: [{ type: "text", textContent: text }],
      });

      // Fire-and-forget tagging
      taggingService.generateTags(text).then((tags) => {
        if (tags.length > 0) diaryService.updateTags(entry.id, tags);
      }).catch(() => {});

      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /entries/:id/text  { text }
  router.patch("/:id/text", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { text } = req.body as { text: string };

      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      const entry = await diaryService.updateEntryText({
        entryId: req.params.id,
        actorId: actor.userId,
        newText: text,
      });

      // Fire-and-forget re-tagging
      taggingService.generateTags(text).then((tags) => {
        if (tags.length > 0) diaryService.updateTags(entry.id, tags);
      }).catch(() => {});

      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /entries/:id/date  { eventDate }
  router.patch("/:id/date", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { eventDate } = req.body as { eventDate: string };

      if (!eventDate) {
        res.status(400).json({ error: "eventDate is required" });
        return;
      }

      const entry = await diaryService.updateEventDate({
        entryId: req.params.id,
        actorId: actor.userId,
        eventDate: new Date(eventDate),
      });
      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /entries/:id
  router.delete("/:id", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      await diaryService.deleteEntry({ entryId: req.params.id, actorId: actor.userId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/routes/entries.routes.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/api/routes/entries.routes.ts tests/api/routes/entries.routes.test.ts
git commit -m "feat(api): add entries CRUD routes (GET/POST/PATCH/DELETE)"
```

---

### Task 5: Summary Route

**Files:**
- Create: `src/api/routes/summary.routes.ts`
- Test: `tests/api/routes/summary.routes.test.ts`

**Context:** SummaryService.generateSummary takes `{ babyName, birthDate, month, year, entriesText[] }`. Route handler must: get baby info, get entries for the month via `diaryService.getEntriesForDateRange`, extract text, call summary service. The summary handler in the bot (`src/bot/handlers/summary.ts`) has the same flow — reference it for the text extraction logic.

**Step 1: Write test**

```typescript
// tests/api/routes/summary.routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createSummaryRouter } from "../../src/api/routes/summary.routes.js";

const mockBabyService = {
  getBabyByUser: vi.fn().mockResolvedValue({
    id: "baby-1", name: "Вика", birthDate: new Date("2025-01-15"),
  }),
};

const mockDiaryService = {
  getEntriesForDateRange: vi.fn().mockResolvedValue([
    {
      id: "e1",
      eventDate: new Date("2026-02-15"),
      author: { firstName: "Серёжа" },
      items: [{ type: "text", textContent: "First steps!" }],
    },
  ]),
};

const mockSummaryService = {
  generateSummary: vi.fn().mockResolvedValue("Вика начала ходить!"),
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { telegramId: BigInt(12345), userId: "user-1" };
    next();
  });
  app.use("/summary", createSummaryRouter(
    mockBabyService as any, mockDiaryService as any, mockSummaryService as any,
  ));
  return app;
}

describe("summary routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST / returns generated summary", async () => {
    const res = await request(createApp())
      .post("/summary")
      .send({ month: 2, year: 2026 });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("Вика начала ходить!");
    expect(mockSummaryService.generateSummary).toHaveBeenCalled();
  });

  it("POST / returns 400 without month/year", async () => {
    const res = await request(createApp())
      .post("/summary")
      .send({});
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/routes/summary.routes.test.ts`
Expected: FAIL — module not found

**Step 3: Write summary routes implementation**

Check `src/bot/handlers/summary.ts` for text extraction logic to reuse the same approach.

```typescript
// src/api/routes/summary.routes.ts
import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { BabyService } from "../../services/baby.service.js";
import type { DiaryService } from "../../services/diary.service.js";
import type { SummaryService } from "../../services/summary.service.js";
import type { AuthedRequest } from "../types.js";

export function createSummaryRouter(
  babyService: BabyService,
  diaryService: DiaryService,
  summaryService: SummaryService,
): Router {
  const router = Router();

  // POST /summary  { month, year }
  router.post("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const { month, year } = req.body as { month?: number; year?: number };

      if (!month || !year) {
        res.status(400).json({ error: "month and year are required" });
        return;
      }

      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "No baby diary found" });
        return;
      }

      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0); // last day of month

      const entries = await diaryService.getEntriesForDateRange({
        babyId: baby.id,
        actorId: actor.userId,
        dateFrom,
        dateTo,
      });

      const entriesText = entries.map((entry) => {
        const textItems = entry.items
          .filter((item) => item.textContent)
          .map((item) => item.textContent!)
          .join(" ");
        const date = entry.eventDate instanceof Date
          ? entry.eventDate.toISOString().split("T")[0]
          : String(entry.eventDate);
        return `[${date}] ${entry.author.firstName}: ${textItems}`;
      });

      const summary = await summaryService.generateSummary({
        babyName: baby.name,
        birthDate: baby.birthDate,
        month,
        year,
        entriesText,
      });

      res.json({
        summary,
        totalEntries: entries.length,
        month,
        year,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/routes/summary.routes.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/api/routes/summary.routes.ts tests/api/routes/summary.routes.test.ts
git commit -m "feat(api): add summary route (POST /summary)"
```

---

### Task 6: Media Proxy Route

**Files:**
- Create: `src/api/routes/media.routes.ts`
- Test: `tests/api/routes/media.routes.test.ts`

**Context:** Telegram file_id → call `bot.api.getFile(fileId)` to get `file_path` → stream from `https://api.telegram.org/file/bot{TOKEN}/{file_path}`. The bot instance is created in `index.ts` — pass `bot.api` to the router factory, or pass a `getFileUrl` helper function.

**Step 1: Write test**

```typescript
// tests/api/routes/media.routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createMediaRouter } from "../../src/api/routes/media.routes.js";

const mockGetFileUrl = vi.fn();

function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = { telegramId: BigInt(12345), userId: "user-1" };
    next();
  });
  app.use("/media", createMediaRouter(mockGetFileUrl));
  return app;
}

describe("media routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /:fileId returns 400 for empty fileId", async () => {
    const res = await request(createApp()).get("/media/%20");
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/routes/media.routes.test.ts`
Expected: FAIL — module not found

**Step 3: Write media routes implementation**

```typescript
// src/api/routes/media.routes.ts
import { Router } from "express";
import type { Response, NextFunction } from "express";
import { logger } from "../../config/logger.js";
import type { AuthedRequest } from "../types.js";

type GetFileUrl = (fileId: string) => Promise<string>;

export function createMediaRouter(getFileUrl: GetFileUrl): Router {
  const router = Router();

  // GET /media/:fileId — proxy Telegram file
  router.get("/:fileId", async (req, res: Response, next: NextFunction) => {
    try {
      const fileId = req.params.fileId.trim();
      if (!fileId) {
        res.status(400).json({ error: "fileId is required" });
        return;
      }

      const url = await getFileUrl(fileId);
      const upstream = await fetch(url);

      if (!upstream.ok) {
        res.status(502).json({ error: "Failed to fetch file from Telegram" });
        return;
      }

      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");

      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(value);
          return pump();
        };
        await pump();
      } else {
        res.status(502).json({ error: "Empty response from Telegram" });
      }
    } catch (err) {
      logger.error({ err, fileId: req.params.fileId }, "Media proxy error");
      next(err);
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/routes/media.routes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/routes/media.routes.ts tests/api/routes/media.routes.test.ts
git commit -m "feat(api): add media proxy route (GET /media/:fileId)"
```

---

### Task 7: Main API Router and Mount in index.ts

**Files:**
- Create: `src/api/router.ts`
- Modify: `src/index.ts:1-72` — add API router mount + static serving
- Modify: `src/config/env.ts` — add optional `MINIAPP_PATH` env var

**Step 1: Create the main API router**

```typescript
// src/api/router.ts
import { Router } from "express";
import type { Services } from "../types/bot.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createBabyRouter } from "./routes/baby.routes.js";
import { createEntriesRouter } from "./routes/entries.routes.js";
import { createMediaRouter } from "./routes/media.routes.js";
import { createSummaryRouter } from "./routes/summary.routes.js";
import { apiErrorHandler } from "./middleware/errorHandler.js";

type GetFileUrl = (fileId: string) => Promise<string>;

export function createApiRouter(
  services: Services,
  botToken: string,
  getFileUrl: GetFileUrl,
): Router {
  const router = Router();

  router.use(createAuthMiddleware(services.userService, botToken));

  router.use("/baby", createBabyRouter(services.babyService, services.inviteService));
  router.use("/entries", createEntriesRouter(services.diaryService, services.taggingService));
  router.use("/media", createMediaRouter(getFileUrl));
  router.use("/summary", createSummaryRouter(services.babyService, services.diaryService, services.summaryService));

  router.use(apiErrorHandler);

  return router;
}
```

**Step 2: Mount API router in index.ts**

Add after line 48 (after `bot = createBot(services);`) and before line 50 (health routes):

```typescript
import { createApiRouter } from "./api/router.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

Add after line 48 (`bot = createBot(services);`):

```typescript
const getFileUrl = async (fileId: string): Promise<string> => {
  const file = await bot.api.getFile(fileId);
  return `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
};

const apiRouter = createApiRouter(services, env.BOT_TOKEN, getFileUrl);
```

Add after line 66 (after health routes, before webhook):

```typescript
// REST API
app.use("/api/v1", express.json(), apiRouter);

// Mini App static files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const miniappDist = path.join(__dirname, "..", "miniapp", "dist");
app.use("/app", express.static(miniappDist));
// SPA fallback — serve index.html for any /app/* route
app.get("/app/*", (_req, res) => {
  res.sendFile(path.join(miniappDist, "index.html"));
});
```

**Step 3: Run all existing tests to ensure nothing breaks**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/api/router.ts src/index.ts
git commit -m "feat(api): mount API router at /api/v1 and serve miniapp static files"
```

---

## Phase 2: Mini App Frontend (Vite + React SPA)

### Task 8: Initialize Vite + React Project

**Files:**
- Create: `miniapp/` directory with Vite scaffold
- Modify: `package.json` — add workspaces (or keep independent)

**Step 1: Initialize Vite project**

```bash
cd /Users/sergeielkin/Base/VIKI_DIARY
npm create vite@latest miniapp -- --template react-ts
```

**Step 2: Install dependencies from prototype**

```bash
cd miniapp
npm install @telegram-apps/sdk tailwindcss @tailwindcss/vite date-fns lucide-react class-variance-authority clsx tailwind-merge
npm install -D @types/node
```

**Step 3: Configure Vite**

```typescript
// miniapp/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/app/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

**Step 4: Set up Tailwind + CSS variables from prototype**

Copy `app/globals.css` from prototype (the warm children's palette CSS custom properties). Adapt imports for Tailwind v4.

**Step 5: Set up cn() utility**

```typescript
// miniapp/src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 6: Verify Vite dev server starts**

```bash
cd miniapp && npm run dev
```
Expected: Dev server starts on port 5173

**Step 7: Commit**

```bash
cd /Users/sergeielkin/Base/VIKI_DIARY
git add miniapp/
git commit -m "feat(miniapp): initialize Vite + React + Tailwind project"
```

---

### Task 9: API Client and Types

**Files:**
- Create: `miniapp/src/api/client.ts`
- Create: `miniapp/src/api/types.ts`
- Create: `miniapp/src/hooks/useTelegram.ts`

**Step 1: Create shared API types**

```typescript
// miniapp/src/api/types.ts
export interface Baby {
  id: string;
  name: string;
  birthDate: string;
  createdAt: string;
}

export interface Author {
  id: string;
  firstName: string;
  username: string | null;
}

export interface EntryItem {
  id: string;
  type: "text" | "photo" | "video" | "voice";
  textContent: string | null;
  fileId: string | null;
  orderIndex: number;
}

export interface DiaryEntry {
  id: string;
  babyId: string;
  authorId: string;
  eventDate: string;
  tags: string[];
  items: EntryItem[];
  author: Author;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedEntries {
  entries: DiaryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SummaryResponse {
  summary: string;
  totalEntries: number;
  month: number;
  year: number;
}
```

**Step 2: Create Telegram hook**

```typescript
// miniapp/src/hooks/useTelegram.ts
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
        };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
      };
    };
  }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState(window.Telegram?.WebApp);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setWebApp(tg);
    }
  }, []);

  return {
    webApp,
    initData: webApp?.initData ?? "",
    user: webApp?.initDataUnsafe?.user,
    colorScheme: webApp?.colorScheme ?? "light",
  };
}
```

**Step 3: Create API client**

```typescript
// miniapp/src/api/client.ts
import type { Baby, PaginatedEntries, DiaryEntry, SummaryResponse, Author } from "./types";

class ApiClient {
  private baseUrl: string;
  private initData: string = "";

  constructor(baseUrl: string = "/api/v1") {
    this.baseUrl = baseUrl;
  }

  setInitData(initData: string) {
    this.initData = initData;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `tma ${this.initData}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `API error: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  getBaby(): Promise<Baby> {
    return this.request("/baby");
  }

  getMembers(): Promise<Author[]> {
    return this.request("/baby/members");
  }

  getEntries(babyId: string, page = 1, limit = 20): Promise<PaginatedEntries> {
    return this.request(`/entries?babyId=${babyId}&page=${page}&limit=${limit}`);
  }

  getEntry(entryId: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}`);
  }

  createEntry(babyId: string, text: string, eventDate?: string): Promise<DiaryEntry> {
    return this.request("/entries", {
      method: "POST",
      body: JSON.stringify({ babyId, text, eventDate }),
    });
  }

  updateEntryText(entryId: string, text: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}/text`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    });
  }

  updateEntryDate(entryId: string, eventDate: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}/date`, {
      method: "PATCH",
      body: JSON.stringify({ eventDate }),
    });
  }

  deleteEntry(entryId: string): Promise<void> {
    return this.request(`/entries/${entryId}`, { method: "DELETE" });
  }

  getSummary(month: number, year: number): Promise<SummaryResponse> {
    return this.request("/summary", {
      method: "POST",
      body: JSON.stringify({ month, year }),
    });
  }

  mediaUrl(fileId: string): string {
    return `${this.baseUrl}/media/${encodeURIComponent(fileId)}`;
  }
}

export const api = new ApiClient();
```

**Step 4: Commit**

```bash
git add miniapp/src/api/ miniapp/src/hooks/useTelegram.ts
git commit -m "feat(miniapp): add API client, types, and Telegram hook"
```

---

### Task 10: Migrate UI Components from Prototype

**Files:**
- Copy and adapt from prototype repo: `components/feed-screen.tsx`, `components/detail-screen.tsx`, `components/create-edit-screen.tsx`, `components/summary-screen.tsx`, `components/bottom-tab-bar.tsx`, `components/telegram-header.tsx`, `components/snackbar.tsx`, `components/app-context.tsx`
- Copy: relevant shadcn/ui components from `components/ui/`
- Copy: `public/photos/` for fallback images (optional)

**Approach:** Clone the prototype repo locally, then copy components one by one, adapting:
1. Replace mock data imports with API client calls
2. Replace `DiaryEntry` type from `mock-data.ts` with the API type from `api/types.ts`
3. Replace hardcoded photo URLs with `api.mediaUrl(fileId)`
4. Remove Next.js-specific imports (`next/font`, `next-themes`)
5. Keep all UI/UX intact — shadcn components, palette, Nunito font, skeletons

**Step 1: Clone prototype and copy components**

```bash
cd /tmp
git clone https://github.com/sergeivad/v0-wiki-diary-mini-app.git
cd /Users/sergeielkin/Base/VIKI_DIARY

# Copy shadcn ui components
mkdir -p miniapp/src/components/ui
cp /tmp/v0-wiki-diary-mini-app/components/ui/button.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/card.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/dialog.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/drawer.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/input.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/label.tsx miniapp/src/components/ui/
cp /tmp/v0-wiki-diary-mini-app/components/ui/textarea.tsx miniapp/src/components/ui/
# Copy any other needed shadcn components

# Copy main screen components
cp /tmp/v0-wiki-diary-mini-app/components/feed-screen.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/detail-screen.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/create-edit-screen.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/summary-screen.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/bottom-tab-bar.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/telegram-header.tsx miniapp/src/components/
cp /tmp/v0-wiki-diary-mini-app/components/snackbar.tsx miniapp/src/components/

# Copy CSS
cp /tmp/v0-wiki-diary-mini-app/app/globals.css miniapp/src/index.css
```

**Step 2: Adapt AppContext to use real API**

Create `miniapp/src/components/app-context.tsx` — rewrite the prototype's context to:
- Call `api.getBaby()` on mount to get baby info
- Call `api.getEntries(babyId, page)` instead of using mock entries
- Call `api.createEntry()`, `api.updateEntryText()`, `api.deleteEntry()` for mutations
- Pass baby info (name, birth date, age) to components
- Handle loading and error states

**Step 3: Adapt feed-screen.tsx**

Key changes:
- Replace `DiaryEntry` import from `mock-data` with `api/types`
- Replace `media.url` with `api.mediaUrl(item.fileId)` for photos/videos
- Replace `author.avatar` with first-letter avatar (prototype already does this)
- Replace `formatDateRu` — keep it, it's a helper, move to `miniapp/src/lib/format.ts`

**Step 4: Adapt detail-screen.tsx**

Key changes:
- Photo/video URLs via `api.mediaUrl(item.fileId)`
- Delete calls `api.deleteEntry(entry.id)` then navigates back
- Edit navigates to edit screen

**Step 5: Adapt create-edit-screen.tsx**

Key changes:
- Create: calls `api.createEntry(babyId, text, eventDate)` — no photo attachment in v0.4
- Edit: calls `api.updateEntryText(entryId, text)` and/or `api.updateEntryDate(entryId, date)`
- Remove photo attachment UI (or grey it out with "Скоро" label)

**Step 6: Adapt summary-screen.tsx**

Key changes:
- Calls `api.getSummary(month, year)` instead of using mock `MONTHLY_SUMMARY`
- Response includes `summary` text and `totalEntries` — display them
- Tag statistics and heatmap: not available from API in v0.4, hide or show placeholder

**Step 7: Create App.tsx entry point**

```typescript
// miniapp/src/App.tsx
import { useEffect } from "react";
import { AppProvider } from "./components/app-context";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const { initData } = useTelegram();

  useEffect(() => {
    if (initData) {
      api.setInitData(initData);
    }
  }, [initData]);

  return <AppProvider />;
}
```

**Step 8: Update main.tsx**

```typescript
// miniapp/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 9: Verify dev server builds and renders**

```bash
cd miniapp && npm run dev
```
Expected: App renders in browser, shows loading state (no API yet)

**Step 10: Commit**

```bash
cd /Users/sergeielkin/Base/VIKI_DIARY
git add miniapp/
git commit -m "feat(miniapp): migrate all screens from prototype with real API integration"
```

---

### Task 11: Telegram WebApp SDK Integration

**Files:**
- Modify: `miniapp/index.html` — add Telegram WebApp script
- Modify: `miniapp/src/components/app-context.tsx` — use BackButton, haptics
- Modify: `miniapp/src/components/detail-screen.tsx` — BackButton integration

**Step 1: Add Telegram script to index.html**

```html
<!-- miniapp/index.html — add before closing </head> -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

**Step 2: Wire BackButton to navigation**

In `app-context.tsx`, when navigating away from feed:
```typescript
// Show BackButton when not on feed screen
useEffect(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  if (screen.type !== "feed") {
    tg.BackButton.show();
    const handler = () => goBack();
    tg.BackButton.onClick(handler);
    return () => tg.BackButton.offClick(handler);
  } else {
    tg.BackButton.hide();
  }
}, [screen]);
```

**Step 3: Add haptic feedback on key actions**

- On entry create: `HapticFeedback.notificationOccurred("success")`
- On entry delete: `HapticFeedback.notificationOccurred("warning")`
- On tab switch: `HapticFeedback.impactOccurred("light")`

**Step 4: Commit**

```bash
git add miniapp/
git commit -m "feat(miniapp): integrate Telegram WebApp SDK (BackButton, haptics)"
```

---

## Phase 3: Build and Deployment

### Task 12: Update Dockerfile for Miniapp Build

**Files:**
- Modify: `Dockerfile`
- Modify: `miniapp/package.json` — ensure `build` script exists

**Step 1: Update Dockerfile to build miniapp**

Add miniapp build stage after the backend build:

```dockerfile
# After the existing builder stage, add:
FROM node:22-alpine AS miniapp-builder

WORKDIR /app/miniapp

COPY miniapp/package.json miniapp/package-lock.json ./
RUN npm ci

COPY miniapp/ ./
RUN npm run build

# In the runner stage, add:
COPY --from=miniapp-builder /app/miniapp/dist ./miniapp/dist
```

The Express server in `src/index.ts` serves `miniapp/dist` on `/app/*`.

**Step 2: Verify Docker build works**

```bash
docker build -t viki-diary-v04-test .
```
Expected: Build succeeds, image contains both `dist/` (backend) and `miniapp/dist/` (frontend)

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "build: update Dockerfile to build and serve miniapp"
```

---

### Task 13: Configure Bot to Open Mini App

**Files:**
- Modify: `src/bot/handlers/start.ts` or create a new handler — add a bot command to open Mini App

**Step 1: Add /app command to bot**

Add a handler for `/app` command that sends a button to open the Mini App:

```typescript
// In the appropriate handler file, add:
bot.command("app", async (ctx) => {
  await ctx.reply("Открыть дневник", {
    reply_markup: {
      inline_keyboard: [[
        { text: "📖 Открыть дневник", web_app: { url: `https://viki.deazmont.ru/app` } },
      ]],
    },
  });
});
```

**Step 2: Register the command in bot menu**

Add to bot commands list if using `bot.api.setMyCommands`.

**Step 3: Commit**

```bash
git add src/bot/
git commit -m "feat(bot): add /app command to open Mini App"
```

---

### Task 14: End-to-End Testing and Polish

**Step 1: Run all backend tests**

```bash
npm test
```
Expected: All tests PASS

**Step 2: Start dev environment and test manually**

```bash
# Terminal 1: backend
npm run db:up
npm run dev

# Terminal 2: miniapp dev server
cd miniapp && npm run dev
```

**Step 3: Test checklist**

- [ ] Mini App loads in Telegram (via BotFather web_app_url or /app command)
- [ ] Feed shows real entries from the database
- [ ] Entry detail screen shows text, photos (proxied), tags
- [ ] Create screen creates a text entry, shows in feed after navigation
- [ ] Edit screen updates entry text, shows updated text
- [ ] Delete entry works with confirmation
- [ ] Summary screen generates and displays monthly summary
- [ ] BackButton works on all screens
- [ ] Haptic feedback fires on actions
- [ ] Auth rejects requests without valid initData

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete v0.4 — REST API + Telegram Mini App"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **Phase 1: REST API** | Tasks 1–7 | Auth middleware, error handler, 4 route modules, main router, mount in Express |
| **Phase 2: Mini App** | Tasks 8–11 | Vite+React project, API client, migrated UI components, Telegram SDK |
| **Phase 3: Deploy** | Tasks 12–14 | Docker build, bot command, e2e testing |

**Total new files:** ~15 backend + ~15 frontend
**Modified files:** `src/index.ts`, `Dockerfile`, bot handler
**No changes to:** Prisma schema, existing services, existing bot logic
