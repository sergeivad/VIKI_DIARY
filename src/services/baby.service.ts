import { BabyMemberRole, type Baby, type PrismaClient, type User } from "@prisma/client";

import { generateInviteToken } from "../utils/token.js";

export type CreateBabyInput = {
  name: string;
  birthDate: Date;
  ownerUserId: string;
};

export class BabyService {
  constructor(private readonly db: PrismaClient) {}

  async createBaby(input: CreateBabyInput): Promise<Baby> {
    const existing = await this.getBabyByUser(input.ownerUserId);
    if (existing) {
      throw new Error("User already belongs to a baby diary");
    }

    return this.db.$transaction(async (tx) => {
      const baby = await tx.baby.create({
        data: {
          name: input.name,
          birthDate: input.birthDate,
          inviteToken: generateInviteToken()
        }
      });

      await tx.babyMember.create({
        data: {
          babyId: baby.id,
          userId: input.ownerUserId,
          role: BabyMemberRole.owner
        }
      });

      return baby;
    });
  }

  async getBabyByUser(userId: string): Promise<Baby | null> {
    const membership = await this.db.babyMember.findFirst({
      where: { userId },
      include: { baby: true }
    });

    return membership?.baby ?? null;
  }

  async getMembers(babyId: string): Promise<User[]> {
    const members = await this.db.babyMember.findMany({
      where: { babyId },
      include: { user: true }
    });

    return members.map((item) => item.user);
  }
}
