import { describe, expect, it, vi } from "vitest";

import { onboardingConversation } from "../../src/bot/conversations/onboarding.js";

describe("onboardingConversation", () => {
  it("creates baby with validated input", async () => {
    const waitFor = vi
      .fn()
      .mockResolvedValueOnce({ message: { text: "Вика" } })
      .mockResolvedValueOnce({ message: { text: "22.02.2026" } });

    const createBaby = vi.fn().mockResolvedValue({
      name: "Вика",
      birthDate: new Date("2026-02-22T00:00:00.000Z"),
      inviteToken: "token-1"
    });

    const ctx = {
      services: {
        babyService: {
          getBabyByUser: vi.fn().mockResolvedValue(null),
          createBaby
        },
        inviteService: {
          buildInviteLink: vi.fn().mockReturnValue("https://t.me/bot?start=invite_token-1")
        }
      },
      reply: vi.fn()
    };

    const conversation = { waitFor };

    await onboardingConversation(
      conversation as never,
      ctx as never,
      { userId: "user-1" }
    );

    expect(createBaby).toHaveBeenCalledWith({
      name: "Вика",
      birthDate: new Date("2026-02-22T00:00:00.000Z"),
      ownerUserId: "user-1"
    });
    expect(ctx.reply).toHaveBeenCalled();
  });
});
