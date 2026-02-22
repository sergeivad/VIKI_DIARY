import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { UserService } from "../../src/services/user.service.js";

describe("UserService", () => {
  it("findOrCreateUser performs upsert and returns user", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "user-1", telegramId: 42n });
    const db = { user: { upsert } } as unknown as PrismaClient;

    const service = new UserService(db);
    const user = await service.findOrCreateUser({
      telegramId: 42n,
      firstName: "Sergei",
      username: "sergei"
    });

    expect(user.id).toBe("user-1");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { telegramId: 42n },
      create: {
        telegramId: 42n,
        firstName: "Sergei",
        username: "sergei"
      },
      update: {
        firstName: "Sergei",
        username: "sergei"
      }
    });
  });
});
