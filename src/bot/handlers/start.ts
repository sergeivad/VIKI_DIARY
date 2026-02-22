import { InlineKeyboard } from "grammy";

import type { BotContext } from "../../types/bot.js";

const startKeyboard = new InlineKeyboard()
  .text("Создать дневник", "onboarding:create")
  .row()
  .text("У меня есть инвайт-ссылка", "onboarding:invite-help");

function parseInviteToken(match: string): string | null {
  const trimmed = match.trim();
  if (!trimmed.startsWith("invite_")) {
    return null;
  }

  const token = trimmed.slice("invite_".length);
  return token.length > 0 ? token : null;
}

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const inviteToken = typeof ctx.match === "string" ? parseInviteToken(ctx.match) : null;
  if (inviteToken) {
    await ctx.reply(
      [
        "Инвайт-ссылка распознана.",
        "Полное присоединение по инвайту будет доступно на этапе 2.",
        `Токен: ${inviteToken}`
      ].join("\n")
    );
    return;
  }

  const existingBaby = await ctx.services.babyService.getBabyByUser(user.id);
  if (existingBaby) {
    await ctx.reply(
      [
        `Вы уже состоите в дневнике: ${existingBaby.name}.`,
        "Следующие команды будут подключены в следующих этапах: /history, /invite."
      ].join("\n")
    );
    return;
  }

  await ctx.reply(
    "Привет! Я помогу вести дневник вашего малыша.",
    { reply_markup: startKeyboard }
  );
}
