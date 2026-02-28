import type { BotContext } from "../../types/bot.js";
import { formatRuDate, toUtcDateOnly } from "../../utils/date.js";
import { mapDiaryActionErrorMessage } from "./entryActionErrors.js";
import { getHistoryTextContent } from "../formatters/entry.js";
import {
  buildDateSelectionKeyboard,
  buildDeleteConfirmationKeyboard,
  buildEntryActionsKeyboard,
  ENTRY_CALLBACK_PREFIX,
  QUICK_DATE_DAY_BEFORE,
  QUICK_DATE_YESTERDAY
} from "../keyboards/entryActions.js";

type ParsedEntryCallback =
  | { type: "edit"; entryId: string }
  | { type: "open-date-menu"; entryId: string }
  | { type: "quick-date"; entryId: string; kind: typeof QUICK_DATE_YESTERDAY | typeof QUICK_DATE_DAY_BEFORE }
  | { type: "manual-date"; entryId: string }
  | { type: "cancel-date"; entryId: string }
  | { type: "open-delete-menu"; entryId: string }
  | { type: "confirm-delete"; entryId: string }
  | { type: "cancel-delete"; entryId: string };

function parseEntryCallbackData(data: string): ParsedEntryCallback | null {
  const parts = data.split(":");
  if (parts[0] !== ENTRY_CALLBACK_PREFIX) {
    return null;
  }

  if (parts[1] === "edit" && parts.length === 3) {
    return { type: "edit", entryId: parts[2] };
  }

  if (parts[1] === "date") {
    if (parts.length === 3) {
      return { type: "open-date-menu", entryId: parts[2] };
    }

    if (parts.length === 5 && parts[2] === "quick") {
      if (parts[3] === QUICK_DATE_YESTERDAY || parts[3] === QUICK_DATE_DAY_BEFORE) {
        return { type: "quick-date", entryId: parts[4], kind: parts[3] };
      }
      return null;
    }

    if (parts.length === 4 && parts[2] === "manual") {
      return { type: "manual-date", entryId: parts[3] };
    }

    if (parts.length === 4 && parts[2] === "cancel") {
      return { type: "cancel-date", entryId: parts[3] };
    }
  }

  if (parts[1] === "delete") {
    if (parts.length === 3) {
      return { type: "open-delete-menu", entryId: parts[2] };
    }

    if (parts.length === 4 && parts[2] === "confirm") {
      return { type: "confirm-delete", entryId: parts[3] };
    }

    if (parts.length === 4 && parts[2] === "cancel") {
      return { type: "cancel-delete", entryId: parts[3] };
    }
  }

  return null;
}

function addUtcDays(base: Date, days: number): Date {
  const utcDate = toUtcDateOnly(base);
  return new Date(Date.UTC(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate() + days
  ));
}

async function resolveActorId(ctx: BotContext): Promise<string | null> {
  if (!ctx.from) {
    return null;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  return user.id;
}

async function showDomainError(ctx: BotContext, error: unknown): Promise<boolean> {
  const message = mapDiaryActionErrorMessage(error);
  if (!message) {
    return false;
  }

  await ctx.answerCallbackQuery({
    text: message,
    show_alert: true
  });
  return true;
}

export async function handleEntryCallbacks(ctx: BotContext): Promise<void> {
  const callbackQuery = ctx.callbackQuery;
  const callbackData = callbackQuery?.data;
  if (typeof callbackData !== "string") {
    await ctx.answerCallbackQuery();
    return;
  }

  const action = parseEntryCallbackData(callbackData);
  if (!action) {
    await ctx.answerCallbackQuery();
    return;
  }

  const actorId = await resolveActorId(ctx);
  if (!actorId) {
    await ctx.answerCallbackQuery();
    return;
  }

  try {
    if (action.type === "edit") {
      const sourceChatId = ctx.chat?.id;
      const sourceMessageId = ctx.callbackQuery?.message?.message_id;
      if (!sourceChatId || typeof sourceMessageId !== "number") {
        await ctx.answerCallbackQuery({
          text: "Не удалось открыть редактирование.",
          show_alert: true
        });
        return;
      }

      const entry = await ctx.services.diaryService.getEntryById({
        entryId: action.entryId,
        actorId
      });

      const currentText = getHistoryTextContent(entry.items);

      await ctx.conversation.enter("editEntryConversation", {
        entryId: action.entryId,
        actorId,
        currentText,
        sourceChatId,
        sourceMessageId
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "open-date-menu") {
      await ctx.editMessageText("📅 Выберите дату события:", {
        reply_markup: buildDateSelectionKeyboard(action.entryId)
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "quick-date") {
      const eventDate = action.kind === QUICK_DATE_YESTERDAY
        ? addUtcDays(new Date(), -1)
        : addUtcDays(new Date(), -2);
      const entry = await ctx.services.diaryService.updateEventDate({
        entryId: action.entryId,
        actorId,
        eventDate
      });
      const confirmationText = `📅 Дата записи изменена на ${formatRuDate(entry.eventDate)}`;

      try {
        await ctx.editMessageText(confirmationText, {
          reply_markup: buildEntryActionsKeyboard(action.entryId)
        });
      } catch (error) {
        console.error("Failed to edit message after date update", { error });
        await ctx.reply(confirmationText, {
          reply_markup: buildEntryActionsKeyboard(action.entryId)
        });
      }

      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "manual-date") {
      const sourceChatId = ctx.chat?.id;
      const sourceMessageId = callbackQuery?.message?.message_id;
      if (!sourceChatId || typeof sourceMessageId !== "number") {
        await ctx.answerCallbackQuery({
          text: "Не удалось открыть ввод даты.",
          show_alert: true
        });
        return;
      }

      await ctx.conversation.enter("dateInputConversation", {
        entryId: action.entryId,
        actorId,
        sourceChatId,
        sourceMessageId
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "cancel-date" || action.type === "cancel-delete") {
      await ctx.editMessageText("Действие отменено.", {
        reply_markup: buildEntryActionsKeyboard(action.entryId)
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "open-delete-menu") {
      const entry = await ctx.services.diaryService.getEntryById({
        entryId: action.entryId,
        actorId
      });

      await ctx.editMessageText(
        `Удалить запись от ${formatRuDate(entry.eventDate)}? Это действие нельзя отменить.`,
        {
        reply_markup: buildDeleteConfirmationKeyboard(action.entryId)
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (action.type === "confirm-delete") {
      await ctx.services.diaryService.deleteEntry({
        entryId: action.entryId,
        actorId
      });
      await ctx.editMessageText("🗑 Запись удалена.");
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    if (await showDomainError(ctx, error)) {
      return;
    }

    const isNotModified =
      error instanceof Error &&
      error.message.includes("message is not modified");

    if (isNotModified) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    console.error("Failed to process entry callback", { error });
    await ctx.answerCallbackQuery({
      text: "Не удалось выполнить действие. Попробуйте ещё раз.",
      show_alert: true
    }).catch(() => {});
  }
}
