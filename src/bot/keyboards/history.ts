import { InlineKeyboard } from "grammy";

export const HISTORY_CALLBACK_PREFIX = "history";

type HistoryNavDirection = "prev" | "next";

export function buildHistoryMediaCallbackData(entryId: string, page: number): string {
  return `${HISTORY_CALLBACK_PREFIX}:media:${entryId}:${page}`;
}

export function buildHistoryNavCallbackData(direction: HistoryNavDirection, page: number): string {
  return `${HISTORY_CALLBACK_PREFIX}:nav:${direction}:${page}`;
}

export function buildHistoryKeyboard(
  entryId: string,
  page: number,
  totalPages: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(
    "📎 Показать медиа",
    buildHistoryMediaCallbackData(entryId, page)
  );

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  if (!hasPrev && !hasNext) {
    return keyboard;
  }

  keyboard.row();
  if (hasPrev) {
    keyboard.text("◀️ Назад", buildHistoryNavCallbackData("prev", page - 1));
  }
  if (hasNext) {
    keyboard.text("Вперёд ▶️", buildHistoryNavCallbackData("next", page + 1));
  }

  return keyboard;
}
