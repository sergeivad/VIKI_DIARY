import { conversations, createConversation } from "@grammyjs/conversations";
import { Bot } from "grammy";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { onboardingConversation } from "./conversations/onboarding.js";
import { handleStart } from "./handlers/start.js";
import type { BotContext, Services } from "../types/bot.js";

export function createBot(services: Services): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    ctx.services = services;
    await next();
  });

  bot.use(conversations());
  bot.use(createConversation(onboardingConversation));

  bot.command("start", handleStart);

  bot.callbackQuery("onboarding:create", async (ctx) => {
    if (!ctx.from) {
      await ctx.answerCallbackQuery();
      return;
    }

    const user = await ctx.services.userService.findOrCreateUser({
      telegramId: BigInt(ctx.from.id),
      firstName: ctx.from.first_name,
      username: ctx.from.username ?? null
    });

    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("onboardingConversation", { userId: user.id });
  });

  bot.callbackQuery("onboarding:invite-help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Откройте ссылку вида https://t.me/<your_bot>?start=invite_<token>. Полный флоу будет в этапе 2.");
  });

  bot.catch((error) => {
    logger.error({ err: error.error }, "Unhandled bot error");
  });

  return bot;
}
