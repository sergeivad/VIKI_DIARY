import type { DiaryEntry, EntryItem, EntryItemType as EntryItemTypeEnum, Prisma, PrismaClient } from "@prisma/client";
import { EntryItemType, Prisma as PrismaRuntime } from "../db/client.js";

import { toUtcDateOnly } from "../utils/date.js";
import { DiaryDomainError, DiaryErrorCode } from "./diary.errors.js";

const MERGE_WINDOW_MINUTES = 10;

export type DiaryItemInput = {
  type: "text" | "photo" | "video" | "voice";
  textContent?: string | null;
  fileId?: string | null;
  thumbnailFileId?: string | null;
};

export type DiaryEntryDTO = DiaryEntry & {
  items: EntryItem[];
};

export type HistoryEntryAuthor = {
  id: string;
  firstName: string;
  username: string | null;
};

export type HistoryEntryDTO = DiaryEntry & {
  author: HistoryEntryAuthor;
  items: EntryItem[];
};

type CreateEntryInput = {
  babyId: string;
  authorId: string;
  eventDate?: Date;
  items: DiaryItemInput[];
  now?: Date;
};

type AddItemsToEntryInput = {
  entryId: string;
  items: DiaryItemInput[];
  now?: Date;
};

type CreateOrAppendInput = {
  babyId: string;
  authorId: string;
  items: DiaryItemInput[];
  now?: Date;
};

type UpdateEventDateInput = {
  entryId: string;
  actorId: string;
  eventDate: Date;
};

type DeleteEntryInput = {
  entryId: string;
  actorId: string;
};

type GetEntryByIdInput = {
  entryId: string;
  actorId: string;
};

type GetEntriesForDateRangeInput = {
  babyId: string;
  actorId: string;
  dateFrom: Date;
  dateTo: Date;
};

type UpdateEntryTextInput = {
  entryId: string;
  actorId: string;
  newText: string;
};

type GetHistoryInput = {
  babyId: string;
  actorId: string;
  page: number;
  limit: number;
};

type GetHistoryResult = {
  entries: HistoryEntryDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type NormalizedDiaryItem = {
  type: EntryItemTypeEnum;
  textContent: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
};

type EntryAccessContext = {
  id: string;
  babyId: string;
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeItems(items: DiaryItemInput[]): NormalizedDiaryItem[] {
  if (items.length === 0) {
    throw new DiaryDomainError(DiaryErrorCode.invalidItems, "Items must not be empty");
  }

  return items.map((item) => {
    if (item.type === "text") {
      const textContent = normalizeText(item.textContent);
      if (!textContent) {
        throw new DiaryDomainError(
          DiaryErrorCode.invalidItems,
          "Text item must have non-empty text content"
        );
      }

      return {
        type: EntryItemType.text,
        textContent,
        fileId: null,
        thumbnailFileId: null
      };
    }

    const fileId = normalizeText(item.fileId);
    if (!fileId) {
      throw new DiaryDomainError(
        DiaryErrorCode.invalidItems,
        "Media item must include file id"
      );
    }

    const typeMap = {
      photo: EntryItemType.photo,
      video: EntryItemType.video,
      voice: EntryItemType.voice
    } as const;

    return {
      type: typeMap[item.type as keyof typeof typeMap],
      textContent: normalizeText(item.textContent),
      fileId,
      thumbnailFileId: normalizeText(item.thumbnailFileId)
    };
  });
}

function normalizeEventDate(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DiaryDomainError(DiaryErrorCode.invalidEventDate, "Event date is invalid");
  }

  return toUtcDateOnly(value);
}

export class DiaryService {
  constructor(private readonly db: PrismaClient) {}

  private async lockAuthorRow(tx: Prisma.TransactionClient, authorId: string): Promise<void> {
    await tx.$queryRaw(
      PrismaRuntime.sql`SELECT 1 FROM "users" WHERE "id" = ${authorId}::uuid FOR UPDATE`
    );
  }

  private async findOpenEntryTx(
    tx: Prisma.TransactionClient,
    babyId: string,
    authorId: string,
    now: Date
  ): Promise<DiaryEntryDTO | null> {
    const utcToday = toUtcDateOnly(now);

    return tx.diaryEntry.findFirst({
      where: {
        babyId,
        authorId,
        eventDate: utcToday,
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
  }

  private async createEntryTx(
    tx: Prisma.TransactionClient,
    input: {
      babyId: string;
      authorId: string;
      eventDate?: Date;
      normalizedItems: NormalizedDiaryItem[];
      now: Date;
    }
  ): Promise<DiaryEntryDTO> {
    return tx.diaryEntry.create({
      data: {
        babyId: input.babyId,
        authorId: input.authorId,
        eventDate: toUtcDateOnly(input.eventDate ?? input.now),
        mergeWindowUntil: addMinutes(input.now, MERGE_WINDOW_MINUTES),
        items: {
          create: input.normalizedItems.map((item, index) => ({
            type: item.type,
            textContent: item.textContent,
            fileId: item.fileId,
            thumbnailFileId: item.thumbnailFileId,
            orderIndex: index
          }))
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
  }

  private async addItemsToEntryTx(
    tx: Prisma.TransactionClient,
    input: {
      entryId: string;
      normalizedItems: NormalizedDiaryItem[];
      now: Date;
    }
  ): Promise<DiaryEntryDTO> {
    const existingEntry = await tx.diaryEntry.findUnique({
      where: { id: input.entryId },
      select: { id: true }
    });

    if (!existingEntry) {
      throw new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found");
    }

    const lastItem = await tx.entryItem.findFirst({
      where: { entryId: input.entryId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true }
    });

    const nextOrderIndex = lastItem ? lastItem.orderIndex + 1 : 0;
    await tx.entryItem.createMany({
      data: input.normalizedItems.map((item, index) => ({
        entryId: input.entryId,
        type: item.type,
        textContent: item.textContent,
        fileId: item.fileId,
        thumbnailFileId: item.thumbnailFileId,
        orderIndex: nextOrderIndex + index
      }))
    });

    await tx.diaryEntry.update({
      where: { id: input.entryId },
      data: {
        mergeWindowUntil: addMinutes(input.now, MERGE_WINDOW_MINUTES)
      }
    });

    const updatedEntry = await tx.diaryEntry.findUnique({
      where: { id: input.entryId },
      include: {
        items: {
          orderBy: {
            orderIndex: "asc"
          }
        }
      }
    });

    if (!updatedEntry) {
      throw new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found");
    }

    return updatedEntry;
  }

  private async assertActorHasAccessToEntryTx(
    tx: Prisma.TransactionClient,
    entryId: string,
    actorId: string
  ): Promise<EntryAccessContext> {
    const entry = await tx.diaryEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        babyId: true
      }
    });

    if (!entry) {
      throw new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found");
    }

    const membership = await tx.babyMember.findUnique({
      where: {
        babyId_userId: {
          babyId: entry.babyId,
          userId: actorId
        }
      },
      select: {
        babyId: true
      }
    });

    if (!membership) {
      throw new DiaryDomainError(
        DiaryErrorCode.entryAccessDenied,
        "User has no access to entry"
      );
    }

    return entry;
  }

  private async assertActorHasAccessToBabyTx(
    tx: Prisma.TransactionClient,
    babyId: string,
    actorId: string
  ): Promise<void> {
    const membership = await tx.babyMember.findUnique({
      where: {
        babyId_userId: {
          babyId,
          userId: actorId
        }
      },
      select: {
        babyId: true
      }
    });

    if (!membership) {
      throw new DiaryDomainError(
        DiaryErrorCode.entryAccessDenied,
        "User has no access to entry"
      );
    }
  }

  async getOpenEntry(
    babyId: string,
    authorId: string,
    now: Date
  ): Promise<DiaryEntryDTO | null> {
    return this.findOpenEntryTx(this.db, babyId, authorId, now);
  }

  async createEntry(input: CreateEntryInput): Promise<DiaryEntryDTO> {
    const now = input.now ?? new Date();
    const normalizedItems = normalizeItems(input.items);

    return this.createEntryTx(this.db, {
      babyId: input.babyId,
      authorId: input.authorId,
      eventDate: input.eventDate,
      normalizedItems,
      now
    });
  }

  async addItemsToEntry(input: AddItemsToEntryInput): Promise<DiaryEntryDTO> {
    const now = input.now ?? new Date();
    const normalizedItems = normalizeItems(input.items);

    return this.db.$transaction((tx) =>
      this.addItemsToEntryTx(tx, {
        entryId: input.entryId,
        normalizedItems,
        now
      })
    );
  }

  async createOrAppend(
    input: CreateOrAppendInput
  ): Promise<{ mode: "created" | "appended"; entry: DiaryEntryDTO }> {
    const now = input.now ?? new Date();
    const normalizedItems = normalizeItems(input.items);

    return this.db.$transaction(async (tx) => {
      await this.lockAuthorRow(tx, input.authorId);

      const openEntry = await this.findOpenEntryTx(tx, input.babyId, input.authorId, now);
      if (openEntry) {
        const entry = await this.addItemsToEntryTx(tx, {
          entryId: openEntry.id,
          normalizedItems,
          now
        });

        return {
          mode: "appended" as const,
          entry
        };
      }

      const entry = await this.createEntryTx(tx, {
        babyId: input.babyId,
        authorId: input.authorId,
        normalizedItems,
        now
      });

      return {
        mode: "created" as const,
        entry
      };
    });
  }

  async updateEventDate(input: UpdateEventDateInput): Promise<DiaryEntryDTO> {
    const eventDate = normalizeEventDate(input.eventDate);

    return this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToEntryTx(tx, input.entryId, input.actorId);

      const updated = await tx.diaryEntry.update({
        where: { id: input.entryId },
        data: { eventDate },
        include: {
          items: {
            orderBy: {
              orderIndex: "asc"
            }
          }
        }
      });

      return updated;
    });
  }

  async getEntryById(input: GetEntryByIdInput): Promise<DiaryEntryDTO> {
    return this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToEntryTx(tx, input.entryId, input.actorId);

      const entry = await tx.diaryEntry.findUnique({
        where: { id: input.entryId },
        include: {
          items: {
            orderBy: {
              orderIndex: "asc"
            }
          }
        }
      });

      if (!entry) {
        throw new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found");
      }

      return entry;
    });
  }

  async getHistory(input: GetHistoryInput): Promise<GetHistoryResult> {
    const page = Math.max(1, Math.trunc(input.page));
    const limit = Math.max(1, Math.trunc(input.limit));

    return this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToBabyTx(tx, input.babyId, input.actorId);

      const [total, entries] = await Promise.all([
        tx.diaryEntry.count({
          where: {
            babyId: input.babyId
          }
        }),
        tx.diaryEntry.findMany({
          where: {
            babyId: input.babyId
          },
          orderBy: {
            createdAt: "desc"
          },
          skip: (page - 1) * limit,
          take: limit,
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
        })
      ]);

      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

      return {
        entries,
        total,
        page,
        limit,
        totalPages
      };
    });
  }

  async updateTags(entryId: string, tags: string[]): Promise<void> {
    await this.db.diaryEntry.update({
      where: { id: entryId },
      data: { tags }
    });
  }

  async getEntriesForDateRange(input: GetEntriesForDateRangeInput): Promise<HistoryEntryDTO[]> {
    return this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToBabyTx(tx, input.babyId, input.actorId);

      return tx.diaryEntry.findMany({
        where: {
          babyId: input.babyId,
          eventDate: {
            gte: input.dateFrom,
            lte: input.dateTo
          }
        },
        orderBy: {
          eventDate: "asc"
        },
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
  }

  async updateEntryText(input: UpdateEntryTextInput): Promise<DiaryEntryDTO> {
    const trimmed = input.newText.trim();
    if (trimmed.length === 0) {
      throw new DiaryDomainError(DiaryErrorCode.invalidItems, "Text must not be empty");
    }

    return this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToEntryTx(tx, input.entryId, input.actorId);

      const textItems = await tx.entryItem.findMany({
        where: {
          entryId: input.entryId,
          type: EntryItemType.text
        },
        orderBy: {
          orderIndex: "asc"
        }
      });

      if (textItems.length > 0) {
        // Update first text item, delete the rest (consolidate)
        await tx.entryItem.update({
          where: { id: textItems[0].id },
          data: { textContent: trimmed }
        });

        if (textItems.length > 1) {
          await tx.entryItem.deleteMany({
            where: {
              id: { in: textItems.slice(1).map((i) => i.id) }
            }
          });
        }
      } else {
        // No text items — shift existing items and insert at orderIndex 0
        await tx.$queryRaw(
          PrismaRuntime.sql`UPDATE "entry_items" SET "order_index" = "order_index" + 1 WHERE "entry_id" = ${input.entryId}::uuid`
        );

        await tx.entryItem.create({
          data: {
            entryId: input.entryId,
            type: EntryItemType.text,
            textContent: trimmed,
            fileId: null,
            orderIndex: 0
          }
        });
      }

      const updated = await tx.diaryEntry.findUnique({
        where: { id: input.entryId },
        include: {
          items: {
            orderBy: {
              orderIndex: "asc"
            }
          }
        }
      });

      if (!updated) {
        throw new DiaryDomainError(DiaryErrorCode.entryNotFound, "Entry not found");
      }

      return updated;
    });
  }

  async deleteEntry(input: DeleteEntryInput): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.assertActorHasAccessToEntryTx(tx, input.entryId, input.actorId);

      await tx.diaryEntry.delete({
        where: {
          id: input.entryId
        }
      });
    });
  }
}
