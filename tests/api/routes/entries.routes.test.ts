import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createEntriesRouter } from "../../../src/api/routes/entries.routes.js";
import type { AuthedRequest } from "../../../src/api/types.js";
import { apiErrorHandler } from "../../../src/api/middleware/errorHandler.js";

vi.mock("../../../src/config/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function fakeAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  (req as AuthedRequest).actor = { telegramId: BigInt(12345), userId: "user-1" };
  next();
}

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
  generateTags: vi.fn(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth);
  app.use("/entries", createEntriesRouter(mockDiaryService as any, mockTaggingService as any));
  app.use(apiErrorHandler);
  return app;
}

describe("entries routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  describe("GET /entries", () => {
    it("returns paginated history", async () => {
      const historyResult = {
        entries: [{ id: "e1", text: "hello" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      mockDiaryService.getHistory.mockResolvedValue(historyResult);

      const res = await request(app).get("/entries?babyId=baby-1&page=1&limit=20");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(historyResult);
      expect(mockDiaryService.getHistory).toHaveBeenCalledWith({
        babyId: "baby-1",
        actorId: "user-1",
        page: 1,
        limit: 20,
      });
    });

    it("returns 400 if babyId missing", async () => {
      const res = await request(app).get("/entries");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /entries/:id", () => {
    it("returns single entry", async () => {
      const entry = { id: "e1", text: "hello", items: [] };
      mockDiaryService.getEntryById.mockResolvedValue(entry);

      const res = await request(app).get("/entries/e1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(entry);
      expect(mockDiaryService.getEntryById).toHaveBeenCalledWith({
        entryId: "e1",
        actorId: "user-1",
      });
    });
  });

  describe("POST /entries", () => {
    it("creates a text entry", async () => {
      const entry = { id: "e1", items: [{ type: "text", textContent: "hello" }] };
      mockDiaryService.createEntry.mockResolvedValue(entry);
      mockTaggingService.generateTags.mockResolvedValue(["tag1"]);
      mockDiaryService.updateTags.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/entries")
        .send({ babyId: "baby-1", text: "hello" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(entry);
      expect(mockDiaryService.createEntry).toHaveBeenCalledWith({
        babyId: "baby-1",
        authorId: "user-1",
        eventDate: undefined,
        items: [{ type: "text", textContent: "hello" }],
      });
    });

    it("returns 400 if babyId or text missing", async () => {
      const res = await request(app).post("/entries").send({ text: "hello" });
      expect(res.status).toBe(400);

      const res2 = await request(app).post("/entries").send({ babyId: "baby-1" });
      expect(res2.status).toBe(400);
    });
  });

  describe("PATCH /entries/:id/text", () => {
    it("updates entry text", async () => {
      const entry = { id: "e1", items: [{ type: "text", textContent: "updated" }] };
      mockDiaryService.updateEntryText.mockResolvedValue(entry);
      mockTaggingService.generateTags.mockResolvedValue(["tag2"]);
      mockDiaryService.updateTags.mockResolvedValue(undefined);

      const res = await request(app)
        .patch("/entries/e1/text")
        .send({ text: "updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(entry);
      expect(mockDiaryService.updateEntryText).toHaveBeenCalledWith({
        entryId: "e1",
        actorId: "user-1",
        newText: "updated",
      });
    });

    it("returns 400 if text missing", async () => {
      const res = await request(app).patch("/entries/e1/text").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /entries/:id/date", () => {
    it("updates entry date", async () => {
      const entry = { id: "e1", eventDate: "2025-06-15T00:00:00.000Z" };
      mockDiaryService.updateEventDate.mockResolvedValue(entry);

      const res = await request(app)
        .patch("/entries/e1/date")
        .send({ eventDate: "2025-06-15" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(entry);
      expect(mockDiaryService.updateEventDate).toHaveBeenCalledWith({
        entryId: "e1",
        actorId: "user-1",
        eventDate: new Date("2025-06-15"),
      });
    });

    it("returns 400 if eventDate missing", async () => {
      const res = await request(app).patch("/entries/e1/date").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /entries/:id", () => {
    it("deletes entry and returns 204", async () => {
      mockDiaryService.deleteEntry.mockResolvedValue(undefined);

      const res = await request(app).delete("/entries/e1");

      expect(res.status).toBe(204);
      expect(mockDiaryService.deleteEntry).toHaveBeenCalledWith({
        entryId: "e1",
        actorId: "user-1",
      });
    });
  });
});
