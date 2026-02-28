import type { PrismaClient, User } from "@prisma/client";

export type FindOrCreateUserInput = {
  telegramId: bigint;
  firstName: string;
  username?: string | null;
  avatarFileId?: string | null;
};

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async findOrCreateUser(input: FindOrCreateUserInput): Promise<User> {
    const data = {
      firstName: input.firstName,
      username: input.username ?? null,
      ...(input.avatarFileId !== undefined && { avatarFileId: input.avatarFileId }),
    };

    return this.db.user.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        ...data
      },
      update: data
    });
  }
}
