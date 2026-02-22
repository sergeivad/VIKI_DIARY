import { EntryItemType, type DiaryEntry, type EntryItem, type PrismaClient } from "@prisma/client";

import { toUtcDateOnly } from "../utils/date.js";
import { DiaryDomainError, DiaryErrorCode } from "./diary.errors.js";

const MERGE_WINDOW_MINUTES = 10;

export type DiaryItemInput = {
  type: "text" | "photo" | "video";
  textContent?: string | null;
  fileId?: string | null;
};

export type DiaryEntryDTO = DiaryEntry & {
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

type NormalizedDiaryItem = {
  type: EntryItemType;
  textContent: string | null;
  fileId: string | null;
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
        fileId: null
      };
    }

    const fileId = normalizeText(item.fileId);
    if (!fileId) {
      throw new DiaryDomainError(
        DiaryErrorCode.invalidItems,
        "Media item must include file id"
      );
    }

    return {
      type: item.type === "photo" ? EntryItemType.photo : EntryItemType.video,
      textContent: normalizeText(item.textContent),
      fileId
    };
  });
}

export class DiaryService {
  constructor(private readonly db: PrismaClient) {}

  async getOpenEntry(
    babyId: string,
    authorId: string,
    now: Date
  ): Promise<DiaryEntryDTO | null> {
    const utcToday = toUtcDateOnly(now);

    return this.db.diaryEntry.findFirst({
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

  async createEntry(input: CreateEntryInput): Promise<DiaryEntryDTO> {
    const now = input.now ?? new Date();
    const normalizedItems = normalizeItems(input.items);

    return this.db.diaryEntry.create({
      data: {
        babyId: input.babyId,
        authorId: input.authorId,
        eventDate: toUtcDateOnly(input.eventDate ?? now),
        mergeWindowUntil: addMinutes(now, MERGE_WINDOW_MINUTES),
        items: {
          create: normalizedItems.map((item, index) => ({
            type: item.type,
            textContent: item.textContent,
            fileId: item.fileId,
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

  async addItemsToEntry(input: AddItemsToEntryInput): Promise<DiaryEntryDTO> {
    const now = input.now ?? new Date();
    const normalizedItems = normalizeItems(input.items);

    return this.db.$transaction(async (tx) => {
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
        data: normalizedItems.map((item, index) => ({
          entryId: input.entryId,
          type: item.type,
          textContent: item.textContent,
          fileId: item.fileId,
          orderIndex: nextOrderIndex + index
        }))
      });

      await tx.diaryEntry.update({
        where: { id: input.entryId },
        data: {
          mergeWindowUntil: addMinutes(now, MERGE_WINDOW_MINUTES)
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
    });
  }

  async createOrAppend(
    input: CreateOrAppendInput
  ): Promise<{ mode: "created" | "appended"; entry: DiaryEntryDTO }> {
    const now = input.now ?? new Date();
    const openEntry = await this.getOpenEntry(input.babyId, input.authorId, now);

    if (openEntry) {
      const entry = await this.addItemsToEntry({
        entryId: openEntry.id,
        items: input.items,
        now
      });

      return {
        mode: "appended",
        entry
      };
    }

    const entry = await this.createEntry({
      babyId: input.babyId,
      authorId: input.authorId,
      items: input.items,
      now
    });

    return {
      mode: "created",
      entry
    };
  }
}
