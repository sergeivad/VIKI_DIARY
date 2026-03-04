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

function buildApp(
  babyService: any,
  diaryService: any,
  summaryService: any,
  getTelegramPhotoData: (fileId: string) => Promise<{ data: Buffer; mimeType: string }> = async () => ({
    data: Buffer.from("photo-bytes"),
    mimeType: "image/jpeg",
  }),
  s3Service: { getObjectData: (s3Key: string) => Promise<{ data: Buffer; mimeType: string | null }> } | null = {
    getObjectData: async () => ({ data: Buffer.from("s3-bytes"), mimeType: "image/jpeg" }),
  },
) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth);
  app.use(
    "/summary",
    createSummaryRouter(
      babyService,
      diaryService,
      summaryService,
      getTelegramPhotoData,
      s3Service,
    ),
  );
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
      getSummary: vi.fn(),
      saveSummary: vi.fn(),
      describePhotos: vi.fn(),
    };
  });

  describe("GET /summary", () => {
    it("returns existing summary (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      summaryService.getSummary.mockResolvedValue({
        id: "sum-1",
        babyId: "baby-1",
        month: 1,
        year: 2026,
        text: "A great month!",
        createdAt: new Date("2026-02-01T12:00:00Z"),
        updatedAt: new Date("2026-02-01T12:00:00Z"),
      });

      const app = buildApp(babyService, diaryService, summaryService);

      const res = await request(app)
        .get("/summary?month=1&year=2026");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        summary: "A great month!",
        month: 1,
        year: 2026,
        createdAt: "2026-02-01T12:00:00.000Z",
      });
      expect(summaryService.getSummary).toHaveBeenCalledWith("baby-1", 1, 2026);
    });

    it("returns 404 when no summary exists", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      summaryService.getSummary.mockResolvedValue(null);

      const app = buildApp(babyService, diaryService, summaryService);

      const res = await request(app)
        .get("/summary?month=1&year=2026");

      expect(res.status).toBe(404);
    });

    it("returns 400 without month/year", async () => {
      const app = buildApp(babyService, diaryService, summaryService);

      const res = await request(app)
        .get("/summary");

      expect(res.status).toBe(400);
    });
  });

  describe("POST /summary", () => {
    it("generates, saves, and returns summary (200)", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      diaryService.getEntriesForDateRange.mockResolvedValue(fakeEntries);
      summaryService.generateSummary.mockResolvedValue("Baby had a great month!");
      summaryService.saveSummary.mockResolvedValue({
        id: "sum-1",
        babyId: "baby-1",
        month: 1,
        year: 2026,
        text: "Baby had a great month!",
        createdAt: new Date("2026-02-01T12:00:00Z"),
        updatedAt: new Date("2026-02-01T12:00:00Z"),
      });

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
        createdAt: "2026-02-01T12:00:00.000Z",
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
      expect(summaryService.saveSummary).toHaveBeenCalledWith(
        "baby-1", 1, 2026, "Baby had a great month!"
      );
    });

    it("includes s3 photos in vision inputs and enriches entries", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      diaryService.getEntriesForDateRange.mockResolvedValue([
        {
          eventDate: new Date("2026-01-06"),
          author: { firstName: "Alice" },
          items: [
            {
              type: "photo",
              fileId: "tg-photo-1",
              s3Key: null,
              textContent: "Фото с прогулки",
            },
            {
              type: "photo",
              fileId: null,
              s3Key: "uploads/u/s3-photo-1.jpg",
              textContent: null,
            },
          ],
        },
      ]);
      summaryService.describePhotos.mockResolvedValue(new Map([
        ["file:tg-photo-1", "Ребенок в коляске на улице"],
        ["s3:uploads/u/s3-photo-1.jpg", "Малыш на коврике дома"],
      ]));
      summaryService.generateSummary.mockResolvedValue("Summary with photos");
      summaryService.saveSummary.mockResolvedValue({
        id: "sum-2",
        babyId: "baby-1",
        month: 1,
        year: 2026,
        text: "Summary with photos",
        createdAt: new Date("2026-02-02T12:00:00Z"),
        updatedAt: new Date("2026-02-02T12:00:00Z"),
      });

      const app = buildApp(
        babyService,
        diaryService,
        summaryService,
        async () => ({ data: Buffer.from("telegram-photo"), mimeType: "image/jpeg" }),
        {
          getObjectData: async () => ({ data: Buffer.from("s3-photo"), mimeType: "image/jpeg" }),
        },
      );

      const res = await request(app)
        .post("/summary")
        .send({ month: 1, year: 2026 });

      expect(res.status).toBe(200);
      expect(summaryService.describePhotos).toHaveBeenCalledTimes(1);
      expect(summaryService.describePhotos).toHaveBeenCalledWith([
        {
          key: "file:tg-photo-1",
          mimeType: "image/jpeg",
          data: expect.any(Buffer),
        },
        {
          key: "s3:uploads/u/s3-photo-1.jpg",
          mimeType: "image/jpeg",
          data: expect.any(Buffer),
        },
      ]);

      expect(summaryService.generateSummary).toHaveBeenCalledWith({
        babyName: "Viki",
        birthDate: fakeBaby.birthDate,
        month: 1,
        year: 2026,
        entriesText: [
          "[2026-01-06] Alice: Фото с прогулки [Фото: Ребенок в коляске на улице] [Фото: Малыш на коврике дома]",
        ],
      });
    });

    it("does not pass Telegram bot token URLs to vision provider", async () => {
      babyService.getBabyByUser.mockResolvedValue(fakeBaby);
      diaryService.getEntriesForDateRange.mockResolvedValue([
        {
          eventDate: new Date("2026-01-07"),
          author: { firstName: "Alice" },
          items: [{ type: "photo", fileId: "tg-photo-2", s3Key: null, textContent: null }],
        },
      ]);
      summaryService.describePhotos.mockResolvedValue(new Map());
      summaryService.generateSummary.mockResolvedValue("No token leak");
      summaryService.saveSummary.mockResolvedValue({
        id: "sum-3",
        babyId: "baby-1",
        month: 1,
        year: 2026,
        text: "No token leak",
        createdAt: new Date("2026-02-03T12:00:00Z"),
        updatedAt: new Date("2026-02-03T12:00:00Z"),
      });

      const app = buildApp(
        babyService,
        diaryService,
        summaryService,
        async () => ({ data: Buffer.from("telegram-photo"), mimeType: "image/jpeg" }),
      );

      await request(app)
        .post("/summary")
        .send({ month: 1, year: 2026 });

      const visionInputs = summaryService.describePhotos.mock.calls[0][0] as Array<unknown>;
      expect(Array.isArray(visionInputs)).toBe(true);
      expect(visionInputs.length).toBe(1);
      expect(typeof visionInputs[0]).toBe("object");

      const serialized = JSON.stringify(visionInputs);
      expect(serialized).not.toContain("SECRET_TOKEN");
      expect(serialized).not.toContain("https://api.telegram.org/file/bot");
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
