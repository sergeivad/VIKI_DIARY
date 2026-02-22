import { describe, expect, it, vi } from "vitest";

import { handleStart } from "../../src/bot/handlers/start.js";
import { InviteDomainError, InviteErrorCode } from "../../src/services/invite.errors.js";

describe("handleStart invite flow", () => {
  it("joins diary on valid invite token", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "invite_token-1",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          acceptInvite: vi.fn().mockResolvedValue({ id: "baby-1", name: "Vika" })
        },
        babyService: {
          getBabyByUser: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleStart(ctx as never);

    expect(ctx.services.inviteService.acceptInvite).toHaveBeenCalledWith("token-1", "user-1");
    expect(ctx.reply).toHaveBeenCalledWith("Вы присоединились к дневнику Vika.");
  });

  it("shows error for invalid invite token", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "invite_bad",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          acceptInvite: vi
            .fn()
            .mockRejectedValue(
              new InviteDomainError(
                InviteErrorCode.inviteTokenInvalid,
                "Invite token is invalid"
              )
            )
        },
        babyService: {
          getBabyByUser: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleStart(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Инвайт-ссылка недействительна или устарела.");
  });

  it("shows current diary when user already belongs to another diary", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "invite_bad",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          acceptInvite: vi
            .fn()
            .mockRejectedValue(
              new InviteDomainError(
                InviteErrorCode.userAlreadyInDiary,
                "User already belongs to a baby diary"
              )
            )
        },
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue({ id: "baby-1", name: "Vika" })
        }
      },
      reply: vi.fn()
    };

    await handleStart(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Вы уже состоите в дневнике: Vika.");
  });
});
