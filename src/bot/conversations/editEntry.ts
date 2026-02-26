import type { EntryItem } from "@prisma/client";

import type { BotConversation, BotContext } from "../../types/bot.js";
import { mapDiaryActionErrorMessage } from "../handlers/entryActionErrors.js";
import { buildEntryActionsKeyboard } from "../keyboards/entryActions.js";

const EDIT_PROMPT = "Введите новый текст записи:";

export type EditEntryConversationPayload = {
  entryId: string;
  actorId: string;
  currentText: string;
  sourceChatId: number;
  sourceMessageId: number;
};

function collectTextContent(items: EntryItem[]): string {
  return items
    .map((item) => item.textContent?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
}

export async function editEntryConversation(
  conversation: BotConversation,
  ctx: BotContext,
  payload?: EditEntryConversationPayload
): Promise<void> {
  if (!payload) {
    await ctx.reply("Не удалось запустить редактирование. Попробуйте снова.");
    return;
  }

  await ctx.reply(`Текущий текст:\n\n${payload.currentText}\n\n${EDIT_PROMPT}`);

  const textMessage = await conversation.waitFor("message:text", {
    otherwise: async (invalidCtx) => {
      await invalidCtx.reply("Пожалуйста, отправьте текстовое сообщение.");
    }
  });

  const newText = textMessage.message.text.trim();
  if (newText.length === 0) {
    await ctx.reply("Текст не может быть пустым. Редактирование отменено.");
    return;
  }

  try {
    const updated = await ctx.services.diaryService.updateEntryText({
      entryId: payload.entryId,
      actorId: payload.actorId,
      newText
    });

    const confirmationText = "✅ Текст записи обновлён.";

    try {
      await ctx.api.editMessageText(
        payload.sourceChatId,
        payload.sourceMessageId,
        confirmationText,
        {
          reply_markup: buildEntryActionsKeyboard(payload.entryId)
        }
      );
    } catch {
      await ctx.reply(confirmationText, {
        reply_markup: buildEntryActionsKeyboard(payload.entryId)
      });
    }

    // Fire-and-forget: regenerate tags after edit
    const text = collectTextContent(updated.items);
    if (text) {
      void (async () => {
        try {
          const tags = await ctx.services.taggingService.generateTags(text);
          if (tags.length > 0) {
            await ctx.services.diaryService.updateTags(updated.id, tags);
          }
        } catch {
          // Fire-and-forget: never throw, never block the user
        }
      })();
    }
  } catch (error) {
    const message = mapDiaryActionErrorMessage(error);
    if (message) {
      await ctx.reply(message);
      return;
    }

    console.error("Failed to update entry text in conversation", { error });
    await ctx.reply("Не удалось обновить текст. Попробуйте ещё раз.");
  }
}
