import { Bot } from "grammy";

import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const bot = new Bot(env.BOT_TOKEN);
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  console.log("Webhook deleted");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
