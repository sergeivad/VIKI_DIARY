import { BabyMemberRole } from "../../db/client.js";

import type { BotContext } from "../../types/bot.js";

type InviteCommandAction = "show" | "regenerate" | "invalid";

function parseInviteCommandAction(match: unknown): InviteCommandAction {
  if (typeof match !== "string") {
    return "show";
  }

  const trimmed = match.trim().toLowerCase();
  if (trimmed.length === 0) {
    return "show";
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const hasExtraArgs = parts.length > 1;

  if (command === "regenerate" || command === "regen") {
    return hasExtraArgs ? "invalid" : "regenerate";
  }

  return "invalid";
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

  const action = parseInviteCommandAction(ctx.match);
  if (action === "invalid") {
    await ctx.reply("Неизвестный аргумент. Используйте /invite или /invite regenerate.");
    return;
  }

  const needsRegeneration = action === "regenerate";
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
