import { EntryItemType } from "@prisma/client";

import type { BotContext } from "../../types/bot.js";
import type { HistoryEntryDTO } from "../../services/diary.service.js";
import { mapDiaryActionErrorMessage } from "./entryActionErrors.js";
import { formatHistoryEntryMessage } from "../formatters/entry.js";
import { buildHistoryKeyboard, HISTORY_CALLBACK_PREFIX } from "../keyboards/history.js";

const EMPTY_HISTORY_MESSAGE = "История пока пуста. Добавьте первую запись.";
const HISTORY_PAGE_SIZE = 1;

type ParsedHistoryCallback =
  | { type: "show-media"; entryId: string; page: number }
  | { type: "navigate"; page: number };

type HistoryPageResult = {
  entry: HistoryEntryDTO;
  page: number;
  totalPages: number;
};

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parseHistoryCallbackData(data: string): ParsedHistoryCallback | null {
  const parts = data.split(":");
  if (parts[0] !== HISTORY_CALLBACK_PREFIX) {
    return null;
  }

  if (parts.length === 4 && parts[1] === "media") {
    const page = parsePositiveInteger(parts[3]);
    if (!page) {
      return null;
    }

    return {
      type: "show-media",
      entryId: parts[2],
      page
    };
  }

  if (parts.length === 4 && parts[1] === "nav" && (parts[2] === "prev" || parts[2] === "next")) {
    const page = parsePositiveInteger(parts[3]);
    if (!page) {
      return null;
    }

    return {
      type: "navigate",
      page
    };
  }

  return null;
}

async function resolveUserContext(
  ctx: BotContext
): Promise<{ actorId: string; babyId: string } | null> {
  if (!ctx.from) {
    return null;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const baby = await ctx.services.babyService.getBabyByUser(user.id);
  if (!baby) {
    return null;
  }

  return {
    actorId: user.id,
    babyId: baby.id
  };
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

async function loadHistoryPage(
  ctx: BotContext,
  input: { babyId: string; actorId: string; requestedPage: number }
): Promise<HistoryPageResult | null> {
  const history = await ctx.services.diaryService.getHistory({
    babyId: input.babyId,
    actorId: input.actorId,
    page: input.requestedPage,
    limit: HISTORY_PAGE_SIZE
  });

  if (history.total === 0 || history.entries.length === 0 && history.totalPages === 0) {
    return null;
  }

  const totalPages = Math.max(1, history.totalPages);
  const safePage = Math.min(Math.max(input.requestedPage, 1), totalPages);
  if (history.entries.length > 0 && safePage === input.requestedPage) {
    return {
      entry: history.entries[0],
      page: safePage,
      totalPages
    };
  }

  const safeHistory = await ctx.services.diaryService.getHistory({
    babyId: input.babyId,
    actorId: input.actorId,
    page: safePage,
    limit: HISTORY_PAGE_SIZE
  });

  if (safeHistory.entries.length === 0) {
    return null;
  }

  return {
    entry: safeHistory.entries[0],
    page: safePage,
    totalPages
  };
}

export async function handleHistoryCallbacks(ctx: BotContext): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (typeof callbackData !== "string") {
    await ctx.answerCallbackQuery();
    return;
  }

  const action = parseHistoryCallbackData(callbackData);
  if (!action) {
    await ctx.answerCallbackQuery();
    return;
  }

  const userContext = await resolveUserContext(ctx);
  if (!userContext) {
    await ctx.answerCallbackQuery({
      text: "Сначала создайте дневник через /start.",
      show_alert: true
    });
    return;
  }

  try {
    if (action.type === "show-media") {
      const entry = await ctx.services.diaryService.getEntryById({
        entryId: action.entryId,
        actorId: userContext.actorId
      });

      const mediaItems = entry.items.filter((item) => (
        (item.type === EntryItemType.photo || item.type === EntryItemType.video) &&
        typeof item.fileId === "string" &&
        item.fileId.length > 0
      ));

      if (mediaItems.length === 0) {
        await ctx.answerCallbackQuery({
          text: "В записи нет медиа.",
          show_alert: true
        });
        return;
      }

      await ctx.answerCallbackQuery();
      for (const mediaItem of mediaItems) {
        if (!mediaItem.fileId) {
          continue;
        }

        if (mediaItem.type === EntryItemType.photo) {
          await ctx.replyWithPhoto(mediaItem.fileId);
          continue;
        }

        await ctx.replyWithVideo(mediaItem.fileId);
      }
      return;
    }

    const historyPage = await loadHistoryPage(ctx, {
      babyId: userContext.babyId,
      actorId: userContext.actorId,
      requestedPage: action.page
    });

    if (!historyPage) {
      await ctx.editMessageText(EMPTY_HISTORY_MESSAGE);
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageText(formatHistoryEntryMessage(historyPage.entry), {
      reply_markup: buildHistoryKeyboard(
        historyPage.entry.id,
        historyPage.page,
        historyPage.totalPages
      )
    });
    await ctx.answerCallbackQuery();
  } catch (error) {
    if (await showDomainError(ctx, error)) {
      return;
    }

    console.error("Failed to process history callback", { error });
    await ctx.answerCallbackQuery({
      text: "Не удалось выполнить действие. Попробуйте ещё раз.",
      show_alert: true
    });
  }
}
