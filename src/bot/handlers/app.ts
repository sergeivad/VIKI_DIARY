import type { BotContext } from "../../types/bot.js";
import { buildOpenDiaryKeyboard } from "../keyboards/entryActions.js";

export async function handleApp(ctx: BotContext): Promise<void> {
  await ctx.reply("Откройте дневник в красивом виде 👇", {
    reply_markup: buildOpenDiaryKeyboard(),
  });
}
