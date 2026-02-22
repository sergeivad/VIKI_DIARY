import type { User } from "@prisma/client";

import type { BabyService } from "./baby.service.js";

export type NotifyOtherMembersInput = {
  babyId: string;
  excludeUserId: string;
  text: string;
};

export type SendMessageFn = (telegramId: bigint, text: string) => Promise<void>;

function isValidTelegramId(user: User): user is User & { telegramId: bigint } {
  return typeof user.telegramId === "bigint";
}

export class NotificationService {
  constructor(
    private readonly babyService: BabyService,
    private readonly sendMessage: SendMessageFn
  ) {}

  async notifyOtherMembers(input: NotifyOtherMembersInput): Promise<void> {
    const members = await this.babyService.getMembers(input.babyId);
    const recipients = members.filter((member) => member.id !== input.excludeUserId);

    for (const recipient of recipients) {
      if (!isValidTelegramId(recipient)) {
        continue;
      }

      try {
        await this.sendMessage(recipient.telegramId, input.text);
      } catch (error) {
        console.error("Failed to send member notification", {
          error,
          babyId: input.babyId,
          recipientUserId: recipient.id
        });
      }
    }
  }
}
