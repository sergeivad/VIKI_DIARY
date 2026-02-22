import { BabyMemberRole, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { BabyService } from "../../src/services/baby.service.js";

describe("BabyService", () => {
  it("createBaby creates baby and owner membership in a single transaction", async () => {
    const tx = {
      baby: {
        create: vi.fn().mockResolvedValue({
          id: "baby-1",
          name: "Vika",
          birthDate: new Date("2024-01-01"),
          inviteToken: "token-1"
        })
      },
      babyMember: {
        create: vi.fn().mockResolvedValue({
          babyId: "baby-1",
          userId: "user-1",
          role: BabyMemberRole.owner
        })
      }
    };

    const db = {
      babyMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn()
      },
      baby: {},
      $transaction: vi.fn(async (cb: (transactionClient: typeof tx) => Promise<unknown>) => cb(tx))
    } as unknown as PrismaClient;

    const service = new BabyService(db);
    const result = await service.createBaby({
      name: "Vika",
      birthDate: new Date("2024-01-01"),
      ownerUserId: "user-1"
    });

    expect(result.id).toBe("baby-1");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.baby.create).toHaveBeenCalledTimes(1);
    expect(tx.babyMember.create).toHaveBeenCalledWith({
      data: {
        babyId: "baby-1",
        userId: "user-1",
        role: BabyMemberRole.owner
      }
    });
  });

  it("createBaby throws if user already has a diary", async () => {
    const db = {
      babyMember: {
        findFirst: vi.fn().mockResolvedValue({
          baby: { id: "baby-1", name: "Vika" }
        })
      },
      $transaction: vi.fn()
    } as unknown as PrismaClient;

    const service = new BabyService(db);

    await expect(
      service.createBaby({
        name: "Vika",
        birthDate: new Date("2024-01-01"),
        ownerUserId: "user-1"
      })
    ).rejects.toThrow("User already belongs to a baby diary");

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
