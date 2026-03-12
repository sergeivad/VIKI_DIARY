# Reset Diary CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a production-safe CLI command that deletes an entire diary by Telegram user ID so the user can onboard again from scratch.

**Architecture:** Implement a compiled Node CLI under `src/admin/` so it is included in `dist/` and can run inside the Dokploy `app` container with `node`. Keep deletion logic in a small exported helper that accepts `PrismaClient`, and keep the CLI layer responsible only for argument parsing, logging, exit codes, and Prisma lifecycle.

**Tech Stack:** TypeScript, Prisma 7, Node.js 22, Vitest

---

### Task 1: Add failing tests for reset logic

**Files:**
- Create: `tests/admin/resetDiary.test.ts`
- Reference: `tests/services/baby.service.test.ts`

**Step 1: Write the failing test**

Add tests for:
- successful deletion by `telegram_id`, returning `babyId`, `babyName`, member count, entry count, and summary count;
- missing diary membership returning a clear error;
- invalid CLI argument parsing rejecting non-numeric input.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/admin/resetDiary.test.ts`

Expected: FAIL because `src/admin/resetDiary.ts` does not exist yet.

**Step 3: Commit**

```bash
git add tests/admin/resetDiary.test.ts
git commit -m "test: cover diary reset cli behavior"
```

### Task 2: Implement minimal reset helper and CLI

**Files:**
- Create: `src/admin/resetDiary.ts`
- Reference: `src/db/prisma.ts`

**Step 1: Write minimal implementation**

Implement:
- `parseTelegramIdArgument(value: string | undefined): bigint`
- `resetDiaryByTelegramId(db, telegramId)`
- CLI `main()` that logs a short summary and exits with code `1` on user/diary lookup errors

Deletion flow:
1. Find membership by related `user.telegramId`
2. Read baby metadata + counts
3. Delete `baby` inside a Prisma transaction

**Step 2: Run test to verify it passes**

Run: `npm test -- tests/admin/resetDiary.test.ts`

Expected: PASS

**Step 3: Commit**

```bash
git add src/admin/resetDiary.ts tests/admin/resetDiary.test.ts
git commit -m "feat: add diary reset cli"
```

### Task 3: Expose runnable commands for local and production use

**Files:**
- Modify: `package.json`
- Modify: `docs/deploy-dokploy.md`

**Step 1: Write the failing expectation**

Document and wire:
- local dev command via `tsx`
- production command via compiled `dist` entrypoint

**Step 2: Implement minimal changes**

Add npm scripts:
- `diary:reset`
- `diary:reset:dist`

Add a short Dokploy runbook section with `docker exec` usage.

**Step 3: Verify**

Run:
- `npm test -- tests/admin/resetDiary.test.ts`
- `npm run build`

Expected:
- tests stay green
- build emits `dist/admin/resetDiary.js`

**Step 4: Commit**

```bash
git add package.json docs/deploy-dokploy.md
git commit -m "docs: add production diary reset runbook"
```
