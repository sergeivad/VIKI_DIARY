import type { BotContext } from "../../types/bot.js";

export async function handleApp(ctx: BotContext): Promise<void> {
  await ctx.reply("Откройте дневник в красивом виде 👇", {
    reply_markup: {
      inline_keyboard: [[
        { text: "📖 Открыть дневник", web_app: { url: "https://viki.deazmont.ru/app" } },
      ]],
    },
  });
}
