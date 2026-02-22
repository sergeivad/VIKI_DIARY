import type { BotConversation, BotContext } from "../../types/bot.js";
import { formatRuDate, parseRuDateInput } from "../../utils/date.js";
import { mapDiaryActionErrorMessage } from "../handlers/entryActionErrors.js";
import { buildEntryActionsKeyboard } from "../keyboards/entryActions.js";

const DATE_PROMPT = "Введите дату в формате дд.мм.гггг.";
const DATE_VALIDATION_MESSAGE = "Введите дату в формате дд.мм.гггг.";

export type DateInputConversationPayload = {
  entryId: string;
  actorId: string;
  sourceChatId: number;
  sourceMessageId: number;
};

async function askForDate(conversation: BotConversation, ctx: BotContext): Promise<Date> {
  while (true) {
    await ctx.reply(DATE_PROMPT);

    const dateMessage = await conversation.waitFor("message:text", {
      otherwise: async (invalidCtx) => {
        await invalidCtx.reply(DATE_VALIDATION_MESSAGE);
      }
    });

    const parsedDate = parseRuDateInput(dateMessage.message.text);
    if (parsedDate) {
      return parsedDate;
    }

    await ctx.reply(DATE_VALIDATION_MESSAGE);
  }
}

export async function dateInputConversation(
  conversation: BotConversation,
  ctx: BotContext,
  payload?: DateInputConversationPayload
): Promise<void> {
  if (!payload) {
    await ctx.reply("Не удалось запустить ввод даты. Попробуйте снова.");
    return;
  }

  const parsedDate = await askForDate(conversation, ctx);

  try {
    const updatedEntry = await ctx.services.diaryService.updateEventDate({
      entryId: payload.entryId,
      actorId: payload.actorId,
      eventDate: parsedDate
    });

    await ctx.api.editMessageText(
      payload.sourceChatId,
      payload.sourceMessageId,
      `📅 Дата записи изменена на ${formatRuDate(updatedEntry.eventDate)}`,
      {
        reply_markup: buildEntryActionsKeyboard(payload.entryId)
      }
    );
  } catch (error) {
    const message = mapDiaryActionErrorMessage(error);
    if (message) {
      await ctx.reply(message);
      return;
    }

    console.error("Failed to update entry date in conversation", { error });
    await ctx.reply("Не удалось изменить дату. Попробуйте ещё раз.");
  }
}
