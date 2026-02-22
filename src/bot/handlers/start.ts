import { InlineKeyboard } from "grammy";

import { InviteErrorCode, isInviteDomainError } from "../../services/invite.errors.js";
import type { BotContext } from "../../types/bot.js";
import { parseInviteStartPayload } from "../../utils/invite.js";

const startKeyboard = new InlineKeyboard()
  .text("Создать дневник", "onboarding:create")
  .row()
  .text("У меня есть инвайт-ссылка", "onboarding:invite-help");

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const inviteToken = typeof ctx.match === "string" ? parseInviteStartPayload(ctx.match) : null;
  if (inviteToken) {
    try {
      const baby = await ctx.services.inviteService.acceptInvite(inviteToken, user.id);
      await ctx.reply(`Вы присоединились к дневнику ${baby.name}.`);
    } catch (error) {
      if (
        isInviteDomainError(error) &&
        error.code === InviteErrorCode.inviteTokenInvalid
      ) {
        await ctx.reply("Инвайт-ссылка недействительна или устарела.");
        return;
      }

      if (
        isInviteDomainError(error) &&
        error.code === InviteErrorCode.userAlreadyInDiary
      ) {
        const existingBaby = await ctx.services.babyService.getBabyByUser(user.id);
        if (existingBaby) {
          await ctx.reply(`Вы уже состоите в дневнике: ${existingBaby.name}.`);
        } else {
          await ctx.reply("Вы уже состоите в другом дневнике.");
        }
        return;
      }

      throw error;
    }
    return;
  }

  const existingBaby = await ctx.services.babyService.getBabyByUser(user.id);
  if (existingBaby) {
    await ctx.reply(
      [
        `Вы уже состоите в дневнике: ${existingBaby.name}.`,
        "Команда /invite доступна владельцу дневника."
      ].join("\n")
    );
    return;
  }

  await ctx.reply(
    "Привет! Я помогу вести дневник вашего малыша.",
    { reply_markup: startKeyboard }
  );
}
