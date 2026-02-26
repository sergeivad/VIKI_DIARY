import type { BotContext } from "../../types/bot.js";
import { buildSummaryKeyboard, SUMMARY_CALLBACK_PREFIX } from "../keyboards/summary.js";
import { generateSummaryMessage } from "./summary.js";
import { isSummaryDomainError } from "../../services/summary.errors.js";

function parseSummaryCallback(data: string): { year: number; month: number } | null {
  const parts = data.split(":");
  if (parts[0] !== SUMMARY_CALLBACK_PREFIX || parts[1] !== "nav" || parts.length !== 4) {
    return null;
  }

  const year = Number(parts[2]);
  const month = Number(parts[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  // Don't allow future months
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    return null;
  }

  return { year, month };
}

export async function handleSummaryCallbacks(ctx: BotContext): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (typeof callbackData !== "string") {
    await ctx.answerCallbackQuery();
    return;
  }

  const nav = parseSummaryCallback(callbackData);
  if (!nav) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (!ctx.from) {
    await ctx.answerCallbackQuery();
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const baby = await ctx.services.babyService.getBabyByUser(user.id);
  if (!baby) {
    await ctx.answerCallbackQuery({ text: "Дневник не найден.", show_alert: true });
    return;
  }

  try {
    const message = await generateSummaryMessage(
      ctx, user.id, baby.id, baby.name, baby.birthDate, nav.year, nav.month
    );

    await ctx.editMessageText(message, {
      reply_markup: buildSummaryKeyboard(nav.year, nav.month)
    });
    await ctx.answerCallbackQuery();
  } catch (error) {
    if (isSummaryDomainError(error)) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
      return;
    }

    const isNotModified =
      error instanceof Error && error.message.includes("message is not modified");

    if (isNotModified) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    console.error("Failed to process summary callback", { error });
    await ctx.answerCallbackQuery({
      text: "Не удалось загрузить конспект. Попробуйте ещё раз.",
      show_alert: true
    }).catch(() => {});
  }
}
