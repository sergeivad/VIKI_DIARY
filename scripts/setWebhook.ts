import { Bot } from "grammy";

import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const bot = new Bot(env.BOT_TOKEN);
  await bot.api.setWebhook(env.WEBHOOK_URL, {
    secret_token: env.WEBHOOK_SECRET,
    drop_pending_updates: false
  });
  console.log(`Webhook set to ${env.WEBHOOK_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
