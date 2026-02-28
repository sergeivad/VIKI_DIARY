import { InlineKeyboard } from "grammy";

export const SUMMARY_CALLBACK_PREFIX = "summary";

export function buildSummaryNavCallbackData(year: number, month: number): string {
  return `${SUMMARY_CALLBACK_PREFIX}:nav:${year}:${month}`;
}

export function buildSummaryKeyboard(year: number, month: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  keyboard.text("◀️ Назад", buildSummaryNavCallbackData(prevYear, prevMonth));

  // Next month (only if not current or future)
  const isCurrentOrFuture = year > currentYear || (year === currentYear && month >= currentMonth);
  if (!isCurrentOrFuture) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    keyboard.text("Вперёд ▶️", buildSummaryNavCallbackData(nextYear, nextMonth));
  }

  return keyboard;
}
