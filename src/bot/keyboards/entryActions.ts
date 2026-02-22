import { InlineKeyboard } from "grammy";

export const ENTRY_CALLBACK_PREFIX = "entry";

export const QUICK_DATE_YESTERDAY = "yesterday";
export const QUICK_DATE_DAY_BEFORE = "day_before";

export function buildDateMenuCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:date:${entryId}`;
}

export function buildDeleteMenuCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:delete:${entryId}`;
}

export function buildQuickDateCallbackData(
  entryId: string,
  kind: typeof QUICK_DATE_YESTERDAY | typeof QUICK_DATE_DAY_BEFORE
): string {
  return `${ENTRY_CALLBACK_PREFIX}:date:quick:${kind}:${entryId}`;
}

export function buildManualDateCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:date:manual:${entryId}`;
}

export function buildDateCancelCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:date:cancel:${entryId}`;
}

export function buildDeleteConfirmCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:delete:confirm:${entryId}`;
}

export function buildDeleteCancelCallbackData(entryId: string): string {
  return `${ENTRY_CALLBACK_PREFIX}:delete:cancel:${entryId}`;
}

export function buildEntryActionsKeyboard(entryId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📅 Изменить дату", buildDateMenuCallbackData(entryId))
    .row()
    .text("🗑 Удалить", buildDeleteMenuCallbackData(entryId));
}

export function buildDateSelectionKeyboard(entryId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Вчера", buildQuickDateCallbackData(entryId, QUICK_DATE_YESTERDAY))
    .text("Позавчера", buildQuickDateCallbackData(entryId, QUICK_DATE_DAY_BEFORE))
    .row()
    .text("Ввести дату", buildManualDateCallbackData(entryId))
    .row()
    .text("Отмена", buildDateCancelCallbackData(entryId));
}

export function buildDeleteConfirmationKeyboard(entryId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Да, удалить", buildDeleteConfirmCallbackData(entryId))
    .row()
    .text("Отмена", buildDeleteCancelCallbackData(entryId));
}
