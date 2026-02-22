import { BabyMemberRole, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { InviteService } from "../../src/services/invite.service.js";

describe("InviteService", () => {
  it("acceptInvite adds user to diary", async () => {
    const db = {
      baby: {
        findUnique: vi.fn().mockResolvedValue({
          id: "baby-1",
          name: "Vika",
          birthDate: new Date("2024-01-01"),
          inviteToken: "token-1",
          createdAt: new Date("2024-01-01")
        })
      },
      babyMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          babyId: "baby-1",
          userId: "user-2",
          role: BabyMemberRole.member
        })
      }
    } as unknown as PrismaClient;

    const service = new InviteService(db, "baby_diary_bot");
    const baby = await service.acceptInvite("token-1", "user-2");

    expect(baby.id).toBe("baby-1");
    expect(db.babyMember.create).toHaveBeenCalledWith({
      data: {
        babyId: "baby-1",
        userId: "user-2",
        role: BabyMemberRole.member
      }
    });
  });

  it("acceptInvite throws on invalid token", async () => {
    const db = {
      baby: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      babyMember: {
        findFirst: vi.fn(),
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const service = new InviteService(db, "baby_diary_bot");

    await expect(service.acceptInvite("bad-token", "user-2")).rejects.toThrow(
      "Invite token is invalid"
    );
  });

  it("acceptInvite throws when user already belongs to another diary", async () => {
    const db = {
      baby: {
        findUnique: vi.fn().mockResolvedValue({
          id: "baby-1",
          name: "Vika",
          birthDate: new Date("2024-01-01"),
          inviteToken: "token-1",
          createdAt: new Date("2024-01-01")
        })
      },
      babyMember: {
        findFirst: vi.fn().mockResolvedValue({
          babyId: "baby-2",
          userId: "user-2",
          role: BabyMemberRole.owner,
          createdAt: new Date("2024-01-01"),
          baby: {
            id: "baby-2",
            name: "Another",
            inviteToken: "token-x"
          }
        }),
        create: vi.fn()
      }
    } as unknown as PrismaClient;

    const service = new InviteService(db, "baby_diary_bot");

    await expect(service.acceptInvite("token-1", "user-2")).rejects.toThrow(
      "User already belongs to a baby diary"
    );
    expect(db.babyMember.create).not.toHaveBeenCalled();
  });

  it("regenerateInvite rotates token for owner", async () => {
    const db = {
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({
          babyId: "baby-1",
          userId: "user-1",
          role: BabyMemberRole.owner,
          createdAt: new Date("2024-01-01")
        })
      },
      baby: {
        update: vi.fn().mockResolvedValue({
          id: "baby-1",
          inviteToken: "new-token"
        })
      }
    } as unknown as PrismaClient;

    const service = new InviteService(db, "baby_diary_bot");
    const token = await service.regenerateInvite("baby-1", "user-1");

    expect(token.length).toBeGreaterThan(0);
    expect(db.baby.update).toHaveBeenCalledWith({
      where: { id: "baby-1" },
      data: { inviteToken: token }
    });
  });

  it("regenerateInvite throws for non-owner", async () => {
    const db = {
      babyMember: {
        findUnique: vi.fn().mockResolvedValue({
          babyId: "baby-1",
          userId: "user-2",
          role: BabyMemberRole.member,
          createdAt: new Date("2024-01-01")
        })
      },
      baby: {
        update: vi.fn()
      }
    } as unknown as PrismaClient;

    const service = new InviteService(db, "baby_diary_bot");

    await expect(service.regenerateInvite("baby-1", "user-2")).rejects.toThrow(
      "Only owner can regenerate invite"
    );
    expect(db.baby.update).not.toHaveBeenCalled();
  });
});
