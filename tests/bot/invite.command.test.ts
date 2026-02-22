import { BabyMemberRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { handleInvite } from "../../src/bot/handlers/invite.js";

describe("handleInvite", () => {
  it("shows invite link for owner", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          getInviteInfoForUser: vi.fn().mockResolvedValue({
            babyId: "baby-1",
            babyName: "Vika",
            role: BabyMemberRole.owner,
            inviteToken: "token-1"
          }),
          regenerateInvite: vi.fn(),
          buildInviteLink: vi.fn().mockReturnValue("https://t.me/bot?start=invite_token-1")
        }
      },
      reply: vi.fn()
    };

    await handleInvite(ctx as never);

    expect(ctx.services.inviteService.regenerateInvite).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      [
        "Инвайт-ссылка для дневника Vika:",
        "https://t.me/bot?start=invite_token-1",
        "Чтобы отозвать старую ссылку, используйте: /invite regenerate"
      ].join("\n")
    );
  });

  it("regenerates invite for owner", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "regenerate",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          getInviteInfoForUser: vi.fn().mockResolvedValue({
            babyId: "baby-1",
            babyName: "Vika",
            role: BabyMemberRole.owner,
            inviteToken: "token-1"
          }),
          regenerateInvite: vi.fn().mockResolvedValue("token-2"),
          buildInviteLink: vi.fn().mockReturnValue("https://t.me/bot?start=invite_token-2")
        }
      },
      reply: vi.fn()
    };

    await handleInvite(ctx as never);

    expect(ctx.services.inviteService.regenerateInvite).toHaveBeenCalledWith("baby-1", "user-1");
    expect(ctx.reply).toHaveBeenCalledWith(
      [
        "Инвайт-ссылка для дневника Vika обновлена.",
        "Новая ссылка: https://t.me/bot?start=invite_token-2"
      ].join("\n")
    );
  });

  it("rejects invite command for member", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          getInviteInfoForUser: vi.fn().mockResolvedValue({
            babyId: "baby-1",
            babyName: "Vika",
            role: BabyMemberRole.member,
            inviteToken: "token-1"
          }),
          regenerateInvite: vi.fn(),
          buildInviteLink: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleInvite(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Только владелец может управлять инвайт-ссылкой.");
    expect(ctx.services.inviteService.regenerateInvite).not.toHaveBeenCalled();
  });

  it("handles user without diary", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          getInviteInfoForUser: vi.fn().mockResolvedValue(null),
          regenerateInvite: vi.fn(),
          buildInviteLink: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleInvite(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith("Вы пока не состоите в дневнике.");
  });

  it("returns usage for invalid command args", async () => {
    const ctx = {
      from: {
        id: 42,
        first_name: "Sergei",
        username: "sergei"
      },
      match: "regenerate now",
      services: {
        userService: {
          findOrCreateUser: vi.fn().mockResolvedValue({ id: "user-1" })
        },
        inviteService: {
          getInviteInfoForUser: vi.fn().mockResolvedValue({
            babyId: "baby-1",
            babyName: "Vika",
            role: BabyMemberRole.owner,
            inviteToken: "token-1"
          }),
          regenerateInvite: vi.fn(),
          buildInviteLink: vi.fn()
        }
      },
      reply: vi.fn()
    };

    await handleInvite(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Неизвестный аргумент. Используйте /invite или /invite regenerate."
    );
    expect(ctx.services.inviteService.regenerateInvite).not.toHaveBeenCalled();
  });
});
