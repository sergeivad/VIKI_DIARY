import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../../../src/api/middleware/auth.js";

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
