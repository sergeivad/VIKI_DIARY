import type { PrismaClient, User } from "@prisma/client";

export type FindOrCreateUserInput = {
  telegramId: bigint;
  firstName: string;
  username?: string | null;
};

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async findOrCreateUser(input: FindOrCreateUserInput): Promise<User> {
    return this.db.user.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        firstName: input.firstName,
        username: input.username ?? null
      },
      update: {
        firstName: input.firstName,
        username: input.username ?? null
      }
    });
  }
}
