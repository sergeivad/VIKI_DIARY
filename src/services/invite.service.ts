import {
  BabyMemberRole,
  type Baby,
  type PrismaClient
} from "@prisma/client";

import { generateInviteToken } from "../utils/token.js";
import { buildInviteLink } from "../utils/invite.js";

export type UserInviteInfo = {
  babyId: string;
  babyName: string;
  role: BabyMemberRole;
  inviteToken: string;
};

function isSingleDiaryConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    meta?: { target?: string[] | string };
  };

  if (candidate.code !== "P2002") {
    return false;
  }

  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return target.some((field) => {
      const value = String(field);
      return value.includes("user_id") || value.includes("userId");
    });
  }

  if (typeof target === "string") {
    return target.includes("user_id") || target.includes("userId");
  }

  return false;
}

export class InviteService {
  constructor(
    private readonly db: PrismaClient,
    private readonly botUsername: string
  ) {}

  async generateInvite(babyId: string): Promise<string> {
    const baby = await this.db.baby.findUnique({
      where: { id: babyId },
      select: { inviteToken: true }
    });

    if (!baby) {
      throw new Error("Baby not found");
    }

    return baby.inviteToken;
  }

  async getInviteInfoForUser(userId: string): Promise<UserInviteInfo | null> {
    const membership = await this.db.babyMember.findFirst({
      where: { userId },
      include: {
        baby: {
          select: {
            id: true,
            name: true,
            inviteToken: true
          }
        }
      }
    });

    if (!membership) {
      return null;
    }

    return {
      babyId: membership.baby.id,
      babyName: membership.baby.name,
      role: membership.role,
      inviteToken: membership.baby.inviteToken
    };
  }

  async acceptInvite(inviteToken: string, userId: string): Promise<Baby> {
    const baby = await this.db.baby.findUnique({
      where: { inviteToken }
    });
    if (!baby) {
      throw new Error("Invite token is invalid");
    }

    const existingMembership = await this.db.babyMember.findFirst({
      where: { userId },
      include: {
        baby: {
          select: {
            id: true,
            name: true,
            inviteToken: true
          }
        }
      }
    });

    if (existingMembership) {
      throw new Error("User already belongs to a baby diary");
    }

    try {
      await this.db.babyMember.create({
        data: {
          babyId: baby.id,
          userId,
          role: BabyMemberRole.member
        }
      });
    } catch (error) {
      if (isSingleDiaryConstraintError(error)) {
        throw new Error("User already belongs to a baby diary");
      }
      throw error;
    }

    return baby;
  }

  async regenerateInvite(babyId: string, requestedByUserId: string): Promise<string> {
    const membership = await this.db.babyMember.findUnique({
      where: {
        babyId_userId: {
          babyId,
          userId: requestedByUserId
        }
      }
    });

    if (!membership) {
      throw new Error("Baby membership not found");
    }

    if (membership.role !== BabyMemberRole.owner) {
      throw new Error("Only owner can regenerate invite");
    }

    const token = generateInviteToken();
    await this.db.baby.update({
      where: { id: babyId },
      data: { inviteToken: token }
    });

    return token;
  }

  buildInviteLink(inviteToken: string): string {
    return buildInviteLink(this.botUsername, inviteToken);
  }
}
