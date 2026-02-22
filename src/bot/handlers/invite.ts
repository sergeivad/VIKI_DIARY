import { BabyMemberRole } from "@prisma/client";

import type { BotContext } from "../../types/bot.js";

function shouldRegenerateInvite(match: unknown): boolean {
  if (typeof match !== "string") {
    return false;
  }

  const command = match.trim().toLowerCase();
  return command === "regenerate" || command === "regen";
}

export async function handleInvite(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const inviteInfo = await ctx.services.inviteService.getInviteInfoForUser(user.id);
  if (!inviteInfo) {
    await ctx.reply("Вы пока не состоите в дневнике.");
    return;
  }

  if (inviteInfo.role !== BabyMemberRole.owner) {
    await ctx.reply("Только владелец может управлять инвайт-ссылкой.");
    return;
  }

  const needsRegeneration = shouldRegenerateInvite(ctx.match);
  const token = needsRegeneration
    ? await ctx.services.inviteService.regenerateInvite(inviteInfo.babyId, user.id)
    : inviteInfo.inviteToken;

  const link = ctx.services.inviteService.buildInviteLink(token);

  if (needsRegeneration) {
    await ctx.reply(
      [
        `Инвайт-ссылка для дневника ${inviteInfo.babyName} обновлена.`,
        `Новая ссылка: ${link}`
      ].join("\n")
    );
    return;
  }

  await ctx.reply(
    [
      `Инвайт-ссылка для дневника ${inviteInfo.babyName}:`,
      link,
      "Чтобы отозвать старую ссылку, используйте: /invite regenerate"
    ].join("\n")
  );
}
