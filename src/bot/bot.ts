import { conversations, createConversation } from "@grammyjs/conversations";
import { Bot } from "grammy";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { normalizeBotUsername } from "../utils/invite.js";
import { dateInputConversation } from "./conversations/dateInput.js";
import { editEntryConversation } from "./conversations/editEntry.js";
import { onboardingConversation } from "./conversations/onboarding.js";
import { handleEntryCallbacks } from "./handlers/callbacks.js";
import { handleDiaryMessage } from "./handlers/diary.js";
import { handleHistory } from "./handlers/history.js";
import { handleHistoryCallbacks } from "./handlers/historyCallbacks.js";
import { handleInvite } from "./handlers/invite.js";
import { handleStart } from "./handlers/start.js";
import { handleSummary } from "./handlers/summary.js";
import { handleSummaryCallbacks } from "./handlers/summaryCallbacks.js";
import { createMediaGroupMiddleware } from "./middleware/mediaGroup.js";
import type { BotContext, Services } from "../types/bot.js";

export function createBot(services: Services): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  const servicesPlugin = async (ctx: BotContext, next: () => Promise<void>): Promise<void> => {
    ctx.services = services;
    await next();
  };

  bot.use(servicesPlugin);

  bot.use(conversations({ plugins: [servicesPlugin] }));
  bot.use(createConversation(onboardingConversation));
  bot.use(createConversation(dateInputConversation, "dateInputConversation"));
  bot.use(createConversation(editEntryConversation, "editEntryConversation"));
  bot.use(createMediaGroupMiddleware());

  bot.command("start", handleStart);
  bot.command("invite", handleInvite);
  bot.command("history", handleHistory);
  bot.command("summary", handleSummary);

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
    await ctx.reply(
      `Откройте ссылку вида https://t.me/${normalizeBotUsername(env.BOT_USERNAME)}?start=invite_<token>.`
    );
  });

  bot.callbackQuery(/^entry:/, handleEntryCallbacks);
  bot.callbackQuery(/^history:/, handleHistoryCallbacks);
  bot.callbackQuery(/^summary:/, handleSummaryCallbacks);

  bot.on("message", handleDiaryMessage);

  bot.catch((error) => {
    logger.error({ err: error.error }, "Unhandled bot error");
  });

  return bot;
}
