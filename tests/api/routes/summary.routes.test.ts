import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createSummaryRouter } from "../../../src/api/routes/summary.routes.js";
import type { Request, Response, NextFunction } from "express";

const ACTOR = { telegramId: BigInt(12345), userId: "uuid-1" };

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).actor = ACTOR;
  next();
}

function buildApp(babyService: any, diaryService: any, summaryService: any) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth);
  app.use("/summary", createSummaryRouter(babyService, diaryService, summaryService));
  return app;
}

const fakeBaby = { id: "baby-1", name: "Viki", birthDate: new Date("2024-01-15") };

const fakeEntries = [
  {
    eventDate: new Date("2026-01-05"),
    author: { firstName: "Alice" },
    items: [{ textContent: "First steps today!" }],
  },
  {
    eventDate: new Date("2026-01-12"),
    author: { firstName: "Bob" },
    items: [{ textContent: "Played in the park" }, { textContent: null }],
  },
];

describe("summary routes", () => {
  let babyService: any;
  let diaryService: any;
  let summaryService: any;

  beforeEach(() => {
    babyService = {
      getBabyByUser: vi.fn(),
    };
    diaryService = {
      getEntriesForDateRange: vi.fn(),
    };
    summaryService = {
      generateSummary: vi.fn(),
    };
  });

  describe("POST /summary", () => {
    it("returns generated summary (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      diaryService.getEntriesForDateRange.mockResolvedValue(fakeEntries);
      summaryService.generateSummary.mockResolvedValue("Baby had a great month!");

      const app = buildApp(babyService, diaryService, summaryService);

      const res = await request(app)
        .post("/summary")
        .send({ month: 1, year: 2026 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        summary: "Baby had a great month!",
        totalEntries: 2,
        month: 1,
        year: 2026,
      });
      expect(babyService.getBabyByUser).toHaveBeenCalledWith("uuid-1");
      expect(diaryService.getEntriesForDateRange).toHaveBeenCalledWith({
        babyId: "baby-1",
        actorId: "uuid-1",
        dateFrom: new Date(Date.UTC(2026, 0, 1)),
        dateTo: new Date(Date.UTC(2026, 0, 31)),
      });
      expect(summaryService.generateSummary).toHaveBeenCalledWith({
        babyName: "Viki",
        birthDate: fakeBaby.birthDate,
        month: 1,
        year: 2026,
        entriesText: [
          "[2026-01-05] Alice: First steps today!",
          "[2026-01-12] Bob: Played in the park",
        ],
      });
    });

    it("returns 400 without month/year", async () => {
      const app = buildApp(babyService, diaryService, summaryService);

      const res = await request(app)
        .post("/summary")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: expect.any(String) });
    });
  });
});
