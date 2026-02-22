import type { BotContext } from "../../types/bot.js";
import { formatHistoryEntryMessage } from "../formatters/entry.js";
import { buildHistoryKeyboard } from "../keyboards/history.js";

const NO_DIARY_MESSAGE =
  "Сначала создайте дневник через /start или присоединитесь по инвайт-ссылке.";
const EMPTY_HISTORY_MESSAGE = "История пока пуста. Добавьте первую запись.";
const HISTORY_PAGE_SIZE = 1;

export async function handleHistory(ctx: BotContext): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await ctx.services.userService.findOrCreateUser({
    telegramId: BigInt(ctx.from.id),
    firstName: ctx.from.first_name,
    username: ctx.from.username ?? null
  });

  const baby = await ctx.services.babyService.getBabyByUser(user.id);
  if (!baby) {
    await ctx.reply(NO_DIARY_MESSAGE);
    return;
  }

  const history = await ctx.services.diaryService.getHistory({
    babyId: baby.id,
    actorId: user.id,
    page: 1,
    limit: HISTORY_PAGE_SIZE
  });

  if (history.entries.length === 0) {
    await ctx.reply(EMPTY_HISTORY_MESSAGE);
    return;
  }

  const entry = history.entries[0];
  const totalPages = Math.max(1, history.totalPages);

  await ctx.reply(formatHistoryEntryMessage(entry), {
    reply_markup: buildHistoryKeyboard(entry.id, 1, totalPages)
  });
}
