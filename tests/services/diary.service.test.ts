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

  it("getOpenEntry queries only open entries for Moscow today", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = {
      diaryEntry: {
        findFirst
      }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);
    // 23:59 UTC = 02:59 Moscow next day
    const now = new Date("2026-02-22T23:59:00.000Z");

    await service.getOpenEntry("baby-1", "user-1", now);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        babyId: "baby-1",
        authorId: "user-1",
        eventDate: new Date("2026-02-23T00:00:00.000Z"),
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
    const now = new Date("2026-02-22T12:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      diaryEntry: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1",
          authorId: "user-1",
          eventDate: new Date("2026-02-22T00:00:00.000Z"),
          mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
          createdAt: now,
          updatedAt: now,
          items: []
        })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.createOrAppend({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "text", textContent: "hello" }],
      now
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.diaryEntry.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diaryEntry.create).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("created");
  });

  it("createOrAppend appends to open entry", async () => {
    const now = new Date("2026-02-22T12:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      diaryEntry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1",
          authorId: "user-1",
          eventDate: new Date("2026-02-22T00:00:00.000Z"),
          mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
          createdAt: now,
          updatedAt: now,
          items: []
        }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "entry-1" })
          .mockResolvedValueOnce({
            id: "entry-1",
            babyId: "baby-1",
            authorId: "user-1",
            eventDate: new Date("2026-02-22T00:00:00.000Z"),
            mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
            createdAt: now,
            updatedAt: now,
            items: []
          }),
        update: vi.fn().mockResolvedValue({ id: "entry-1" })
      },
      entryItem: {
        findFirst: vi.fn().mockResolvedValue({ orderIndex: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.createOrAppend({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "text", textContent: "hello" }],
      now
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.entryItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          entryId: "entry-1",
          type: EntryItemType.text,
          textContent: "hello",
          fileId: null,
          orderIndex: 2
        }
      ]
    });
    expect(result.mode).toBe("appended");
  });

  it("createEntry normalizes voice item with fileId and textContent", async () => {
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
          type: EntryItemType.voice,
          textContent: "transcription text",
          fileId: "voice-file-1",
          orderIndex: 0,
          createdAt: now
        }
      ]
    });

    const db = {
      diaryEntry: { create }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await service.createEntry({
      babyId: "baby-1",
      authorId: "user-1",
      items: [{ type: "voice", fileId: "voice-file-1", textContent: "transcription text" }],
      now
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        babyId: "baby-1",
        authorId: "user-1",
        eventDate: new Date("2026-02-22T00:00:00.000Z"),
        mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
        items: {
          create: [
            {
              type: EntryItemType.voice,
              textContent: "transcription text",
              fileId: "voice-file-1",
              orderIndex: 0
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

  it("updateTags updates entry tags", async () => {
    const update = vi.fn().mockResolvedValue({ id: "entry-1", tags: ["еда", "сон"] });

    const db = {
      diaryEntry: { update }
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await service.updateTags("entry-1", ["еда", "сон"]);

    expect(update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { tags: ["еда", "сон"] }
    });
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

  it("updateEventDate updates entry date for diary member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValueOnce({
          id: "entry-1",
          babyId: "baby-1"
        }),
        update: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1",
          authorId: "user-2",
          eventDate: new Date("2026-02-21T00:00:00.000Z"),
          mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
          createdAt: new Date("2026-02-22T12:00:00.000Z"),
          updatedAt: new Date("2026-02-22T12:00:00.000Z"),
          items: []
        })
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({ babyId: "baby-1" })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.updateEventDate({
      entryId: "entry-1",
      actorId: "user-1",
      eventDate: new Date("2026-02-21T19:00:00.000Z")
    });

    expect(result.eventDate).toEqual(new Date("2026-02-21T00:00:00.000Z"));
    expect(tx.diaryEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: {
        eventDate: new Date("2026-02-21T00:00:00.000Z")
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

  it("updateEventDate throws entry_not_found when entry is missing", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn()
      },
      babyMember: {
        findUnique: vi.fn()
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.updateEventDate({
        entryId: "entry-1",
        actorId: "user-1",
        eventDate: new Date("2026-02-21T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryNotFound
    });
  });

  it("updateEventDate throws entry_access_denied for non-member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1"
        }),
        update: vi.fn()
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.updateEventDate({
        entryId: "entry-1",
        actorId: "user-1",
        eventDate: new Date("2026-02-21T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryAccessDenied
    });
  });

  it("updateEventDate throws invalid_event_date for invalid date input", async () => {
    const db = {
      $transaction: vi.fn()
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.updateEventDate({
        entryId: "entry-1",
        actorId: "user-1",
        eventDate: new Date("invalid")
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.invalidEventDate
    });
  });

  it("deleteEntry removes entry for diary member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1"
        }),
        delete: vi.fn().mockResolvedValue({ id: "entry-1" })
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({ babyId: "baby-1" })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await service.deleteEntry({
      entryId: "entry-1",
      actorId: "user-1"
    });

    expect(tx.diaryEntry.delete).toHaveBeenCalledWith({
      where: {
        id: "entry-1"
      }
    });
  });

  it("deleteEntry throws entry_not_found when entry is missing", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue(null),
        delete: vi.fn()
      },
      babyMember: {
        findUnique: vi.fn()
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.deleteEntry({
        entryId: "entry-1",
        actorId: "user-1"
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryNotFound
    });
  });

  it("deleteEntry throws entry_access_denied for non-member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1"
        }),
        delete: vi.fn()
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.deleteEntry({
        entryId: "entry-1",
        actorId: "user-1"
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryAccessDenied
    });
  });

  it("getEntryById returns entry for diary member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: "entry-1",
            babyId: "baby-1"
          })
          .mockResolvedValueOnce({
            id: "entry-1",
            babyId: "baby-1",
            authorId: "user-2",
            eventDate: new Date("2026-02-21T00:00:00.000Z"),
            mergeWindowUntil: new Date("2026-02-22T12:10:00.000Z"),
            createdAt: new Date("2026-02-22T12:00:00.000Z"),
            updatedAt: new Date("2026-02-22T12:00:00.000Z"),
            items: []
          })
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({ babyId: "baby-1" })
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.getEntryById({
      entryId: "entry-1",
      actorId: "user-1"
    });

    expect(result.id).toBe("entry-1");
    expect(result.eventDate).toEqual(new Date("2026-02-21T00:00:00.000Z"));
  });

  it("getEntryById throws entry_not_found when entry is missing", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      babyMember: {
        findUnique: vi.fn()
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.getEntryById({
        entryId: "entry-1",
        actorId: "user-1"
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryNotFound
    });
  });

  it("getEntryById throws entry_access_denied for non-member", async () => {
    const tx = {
      diaryEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "entry-1",
          babyId: "baby-1"
        })
      },
      babyMember: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.getEntryById({
        entryId: "entry-1",
        actorId: "user-1"
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryAccessDenied
    });
  });

  it("getHistory returns paginated entries ordered by createdAt desc", async () => {
    const entries = [
      {
        id: "entry-2",
        babyId: "baby-1",
        authorId: "user-2",
        eventDate: new Date("2026-02-21T00:00:00.000Z"),
        mergeWindowUntil: new Date("2026-02-22T12:20:00.000Z"),
        createdAt: new Date("2026-02-22T12:10:00.000Z"),
        updatedAt: new Date("2026-02-22T12:10:00.000Z"),
        author: {
          id: "user-2",
          firstName: "Elena",
          username: "elena"
        },
        items: []
      }
    ];

    const findMany = vi.fn().mockResolvedValue(entries);

    const tx = {
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({ babyId: "baby-1" })
      },
      diaryEntry: {
        count: vi.fn().mockResolvedValue(3),
        findMany
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.getHistory({
      babyId: "baby-1",
      actorId: "user-1",
      page: 2,
      limit: 1
    });

    expect(result).toEqual({
      entries,
      total: 3,
      page: 2,
      limit: 1,
      totalPages: 3
    });

    expect(tx.diaryEntry.findMany).toHaveBeenCalledWith({
      where: {
        babyId: "baby-1"
      },
      orderBy: {
        createdAt: "desc"
      },
      skip: 1,
      take: 1,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            username: true
          }
        },
        items: {
          orderBy: {
            orderIndex: "asc"
          }
        }
      }
    });
  });

  it("getHistory throws entry_access_denied for non-member", async () => {
    const tx = {
      babyMember: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      diaryEntry: {
        count: vi.fn(),
        findMany: vi.fn()
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    await expect(
      service.getHistory({
        babyId: "baby-1",
        actorId: "user-1",
        page: 1,
        limit: 1
      })
    ).rejects.toMatchObject({
      name: "DiaryDomainError",
      code: DiaryErrorCode.entryAccessDenied
    });

    expect(tx.diaryEntry.count).not.toHaveBeenCalled();
    expect(tx.diaryEntry.findMany).not.toHaveBeenCalled();
  });

  it("getHistory normalizes invalid page and limit", async () => {
    const tx = {
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({ babyId: "baby-1" })
      },
      diaryEntry: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const db = {
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new DiaryService(db);

    const result = await service.getHistory({
      babyId: "baby-1",
      actorId: "user-1",
      page: -5,
      limit: 0
    });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(1);
    expect(tx.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 1
      })
    );
  });
});
