import { EntryItemType, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { DiaryErrorCode } from "../../src/services/diary.errors.js";
import { DiaryService } from "../../src/services/diary.service.js";

describe("DiaryService", () => {
  it("createEntry creates diary entry with ordered items", async () => {
    const now = new Date("2026-02-22T12:00:00.000Z");
    const create = vi.fn().mockResolvedValue({
      id: "entry-1",
      babyId: "baby-1",
      authorId: "user-1",
      eventDate: new Date("2026-02-22T00:00:00.000Z"),
      mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
      createdAt: now,
      updatedAt: now,
      items: [
        {
          id: "item-1",
          entryId: "entry-1",
          type: EntryItemType.text,
          textContent: "first",
          fileId: null,
          orderIndex: 0,
          createdAt: now
        },
        {
          id: "item-2",
          entryId: "entry-1",
          type: EntryItemType.photo,
          textContent: "caption",
          fileId: "file-1",
          orderIndex: 1,
          createdAt: now
        }
      ]
    });

    const db = {
      diaryEntry: {
        create
      }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.createEntry({
      babyId: "baby-1",
      authorId: "user-1",
      items: [
        { type: "text", textContent: "first" },
        { type: "photo", fileId: "file-1", textContent: "caption" }
      ],
      now
    });

    expect(result.id).toBe("entry-1");
    expect(create).toHaveBeenCalledWith({
      data: {
        babyId: "baby-1",
        authorId: "user-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
        items: {
          create: [
            {
              type: EntryItemType.text,
              textContent: "first",
              fileId: null,
              orderIndex: 0
            },
            {
              type: EntryItemType.photo,
              textContent: "caption",
              fileId: "file-1",
              orderIndex: 1
            }
          ]
        }
      },
      include: {
        items: {
          orderBy: {
            orderIndex: "asc"
          }
        }
      }
    });
  });

  it("getOpenEntry queries only open entries for UTC today", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = {
      diaryEntry: {
        findFirst
      }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);
    const now = new Date("2026-02-22T23:59:00.000Z");

    await service.getOpenEntry("baby-1", "user-1", now);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        babyId: "baby-1",
        authorId: "user-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        mergeWindowUntil: {
          gt: now
        }
      },
      include: {
        items: {
          orderBy: {
            orderIndex: "asc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  });

  it("addItemsToEntry appends order indexes and extends merge window", async () => {
    const now = new Date("2026-02-22T12:05:00.000Z");

    const tx = {
      diaryEntry: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "entry-1" })
          .mockResolvedValueOnce({
            id: "entry-1",
            babyId: "baby-1",
            authorId: "user-1",
            eventDate: new Date("2026-02-22T00:00:00.000Z"),
            mergeWindowUntil: new Date("2026-02-22T12:15:00.000Z"),
            createdAt: new Date("2026-02-22T12:00:00.000Z"),
            updatedAt: now,
            items: []
          }),
        update: vi.fn().mockResolvedValue({ id: "entry-1" })
      },
      entryItem: {
        findFirst: vi.fn().mockResolvedValue({ orderIndex: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await service.addItemsToEntry({
      entryId: "entry-1",
      now,
      items: [
        { type: "text", textContent: "new text" },
        { type: "video", fileId: "video-1", textContent: "video caption" }
      ]
    });

    expect(tx.entryItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          entryId: "entry-1",
          type: EntryItemType.text,
          textContent: "new text",
          fileId: null,
          orderIndex: 3
        },
        {
          entryId: "entry-1",
          type: EntryItemType.video,
          textContent: "video caption",
          fileId: "video-1",
          orderIndex: 4
        }
      ]
    });

    expect(tx.diaryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: {
        mergeWindowUntil: new Date("2026-02-22T12:15:00.000Z")
      }
    });
  });

  it("createOrAppend creates a new entry when no open entry exists", async () => {
    const db = {} as PrismaClient;
    const service = new DiaryService(db);

    const getOpenEntrySpy = vi.spyOn(service, "getOpenEntry").mockResolvedValue(null);
    const createEntrySpy = vi.spyOn(service, "createEntry").mockResolvedValue({
      id: "entry-1",
      babyId: "baby-1",
      authorId: "user-1",
      eventDate: new Date("2026-02-22T00:00:00.000Z"),
      mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
      createdAt: new Date("2026-02-22T12:00:00.000Z"),
      updatedAt: new Date("2026-02-22T12:00:00.000Z"),
      items: []
    });

    const result = await service.createOrAppend({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "text", textContent: "hello" }],
      now: new Date("2026-02-22T12:00:00.000Z")
    });

    expect(getOpenEntrySpy).toHaveBeenCalledTimes(1);
    expect(createEntrySpy).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("created");
  });

  it("createOrAppend appends to open entry", async () => {
    const db = {} as PrismaClient;
    const service = new DiaryService(db);

    vi.spyOn(service, "getOpenEntry").mockResolvedValue({
      id: "entry-1",
      babyId: "baby-1",
      authorId: "user-1",
      eventDate: new Date("2026-02-22T00:00:00.000Z"),
      mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
      createdAt: new Date("2026-02-22T12:00:00.000Z"),
      updatedAt: new Date("2026-02-22T12:00:00.000Z"),
      items: []
    });

    const addItemsSpy = vi.spyOn(service, "addItemsToEntry").mockResolvedValue({
      id: "entry-1",
      babyId: "baby-1",
      authorId: "user-1",
      eventDate: new Date("2026-02-22T00:00:00.000Z"),
      mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
      createdAt: new Date("2026-02-22T12:00:00.000Z"),
      updatedAt: new Date("2026-02-22T12:00:00.000Z"),
      items: []
    });

    const result = await service.createOrAppend({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "text", textContent: "hello" }],
      now: new Date("2026-02-22T12:00:00.000Z")
    });

    expect(addItemsSpy).toHaveBeenCalledWith({
      entryId: "entry-1",
      items: [{ type: "text", textContent: "hello" }],
      now: new Date("2026-02-22T12:00:00.000Z")
    });
    expect(result.mode).toBe("appended");
  });

  it("throws invalid_items when item list is empty", async () => {
    const db = {
      diaryEntry: {
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.createEntry({
        babyId: "baby-1",
        authorId: "user-1",
        items: []
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.invalidItems
    });
  });
});
