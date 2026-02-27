import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import { createBabyRouter } from "../../../src/api/routes/baby.routes.js";
import { apiErrorHandler } from "../../../src/api/middleware/errorHandler.js";

const ACTOR = { telegramId: BigInt(12345), userId: "uuid-1" };

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).actor = ACTOR;
  next();
}

function buildApp(babyService: any, inviteService: any) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth);
  app.use("/baby", createBabyRouter(babyService, inviteService));
  app.use(apiErrorHandler);
  return app;
}

const fakeBaby = { id: "baby-1", name: "Viki", birthDate: new Date("2024-01-15"), inviteToken: "tok123" };
const fakeMembers = [
  { id: "uuid-1", telegramId: "12345", firstName: "Alice", username: "alice" },
  { id: "uuid-2", telegramId: "67890", firstName: "Bob", username: "bob" },
];

describe("baby routes", () => {
  let babyService: any;
  let inviteService: any;

  beforeEach(() => {
    babyService = {
      getBabyByUser: vi.fn(),
      getMembers: vi.fn(),
    };
    inviteService = {
      getInviteInfoForUser: vi.fn(),
      regenerateInvite: vi.fn(),
      buildInviteLink: vi.fn(),
    };
  });

  describe("GET /baby", () => {
    it("returns baby info (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: "baby-1", name: "Viki" });
      expect(babyService.getBabyByUser).toHaveBeenCalledWith("uuid-1");
    });

    it("returns 404 when no baby", async () => {
      babyService.getBabyByUser.mockResolvedValue(null);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: expect.any(String) });
    });
  });

  describe("GET /baby/members", () => {
    it("returns members list (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      babyService.getMembers.mockResolvedValue(fakeMembers);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby/members");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(babyService.getMembers).toHaveBeenCalledWith("baby-1");
    });

    it("returns 404 when no baby exists", async () => {
      babyService.getBabyByUser.mockResolvedValue(null);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby/members");

      expect(res.status).toBe(404);
    });
  });

  describe("GET /baby/invite", () => {
    it("returns invite link (200)", async () => {
      inviteService.getInviteInfoForUser.mockResolvedValue({
        babyId: "baby-1",
        babyName: "Viki",
        role: "owner",
        inviteToken: "tok123",
      });
      inviteService.buildInviteLink.mockReturnValue("https://t.me/bot?start=tok123");
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby/invite");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        inviteLink: "https://t.me/bot?start=tok123",
        babyName: "Viki",
      });
    });

    it("returns 404 when no invite info", async () => {
      inviteService.getInviteInfoForUser.mockResolvedValue(null);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).get("/baby/invite");

      expect(res.status).toBe(404);
    });
  });

  describe("POST /baby/invite/regenerate", () => {
    it("returns new invite link (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      inviteService.regenerateInvite.mockResolvedValue("newtok456");
      inviteService.buildInviteLink.mockReturnValue("https://t.me/bot?start=newtok456");
      const app = buildApp(babyService, inviteService);

      const res = await request(app).post("/baby/invite/regenerate");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ inviteLink: "https://t.me/bot?start=newtok456" });
      expect(inviteService.regenerateInvite).toHaveBeenCalledWith("baby-1", "uuid-1");
    });

    it("returns 404 when no baby exists", async () => {
      babyService.getBabyByUser.mockResolvedValue(null);
      const app = buildApp(babyService, inviteService);

      const res = await request(app).post("/baby/invite/regenerate");

      expect(res.status).toBe(404);
    });
  });
});
