import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { parseTelegramIdArgument, resetDiaryByTelegramId } from "../../src/admin/resetDiary.js";

describe("resetDiaryByTelegramId", () => {
  it("deletes the full diary for the provided telegram id", async () => {
    const babyDelete = vi.fn().mockResolvedValue(undefined);
    const membership = {
      baby: {
        id: "baby-1",
        name: "Vika",
        _count: {
          members: 2,
          diaryEntries: 15,
          summaries: 3,
        },
      },
    };

    const db = {
      babyMember: {
        findFirst: vi.fn().mockResolvedValue(membership),
      },
      baby: {
        delete: babyDelete,
      },
      $transaction: vi.fn(async (callback: (tx: { baby: { delete: typeof babyDelete } }) => Promise<unknown>) =>
        callback({ baby: { delete: babyDelete } }),
      ),
    } as unknown as PrismaClient;

    const result = await resetDiaryByTelegramId(db, BigInt("5702901984"));

    expect(result).toEqual({
      babyId: "baby-1",
      babyName: "Vika",
      memberCount: 2,
      entryCount: 15,
      summaryCount: 3,
      telegramId: BigInt("5702901984"),
    });
    expect(db.babyMember.findFirst).toHaveBeenCalledWith({
      where: {
        user: {
          telegramId: BigInt("5702901984"),
        },
      },
      select: {
        baby: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                members: true,
                diaryEntries: true,
                summaries: true,
              },
            },
          },
        },
      },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(babyDelete).toHaveBeenCalledWith({
      where: {
        id: "baby-1",
      },
    });
  });

  it("throws when the telegram user does not belong to a diary", async () => {
    const db = {
      babyMember: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    await expect(resetDiaryByTelegramId(db, BigInt("5702901984"))).rejects.toThrow(
      "Diary not found for Telegram user 5702901984",
    );
  });
});

describe("parseTelegramIdArgument", () => {
  it("parses a numeric telegram id", () => {
    expect(parseTelegramIdArgument("5702901984")).toBe(BigInt("5702901984"));
  });

  it("rejects missing or non-numeric telegram ids", () => {
    expect(() => parseTelegramIdArgument(undefined)).toThrow("Telegram ID argument is required");
    expect(() => parseTelegramIdArgument("abc")).toThrow("Telegram ID must contain only digits");
  });
});
