type TelegramWebhookInfoResponse = {
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections: number;
    ip_address?: string;
  };
  description?: string;
};

async function assertHttpOk(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
}

async function checkWebhook(botToken: string, expectedWebhookUrl?: string): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Telegram API request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TelegramWebhookInfoResponse;
  if (!payload.ok || !payload.result) {
    throw new Error(`Telegram API returned an error: ${payload.description ?? "unknown error"}`);
  }

  if (expectedWebhookUrl && payload.result.url !== expectedWebhookUrl) {
    throw new Error(`Webhook URL mismatch. Expected ${expectedWebhookUrl}, got ${payload.result.url}`);
  }

  if (payload.result.last_error_message) {
    throw new Error(`Telegram reports webhook error: ${payload.result.last_error_message}`);
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.argv[2];
  if (!baseUrl) {
    throw new Error("SMOKE_BASE_URL is required (or pass base URL as first argument)");
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const liveUrl = `${normalizedBaseUrl}/health/live`;
  const readyUrl = `${normalizedBaseUrl}/health/ready`;

  console.log(`Checking ${liveUrl}`);
  await assertHttpOk(liveUrl);
  console.log(`Checking ${readyUrl}`);
  await assertHttpOk(readyUrl);

  const botToken = process.env.BOT_TOKEN;
  if (botToken) {
    const expectedWebhookUrl = process.env.WEBHOOK_URL;
    console.log("Checking Telegram webhook state");
    await checkWebhook(botToken, expectedWebhookUrl);
  } else {
    console.log("BOT_TOKEN is not set. Skipping Telegram webhook check.");
  }

  console.log("Smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
