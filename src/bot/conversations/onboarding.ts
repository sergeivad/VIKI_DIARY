import type { BotConversation, BotContext } from "../../types/bot.js";
import { parseRuDateInput } from "../../utils/date.js";
import { buildOpenDiaryKeyboard } from "../keyboards/entryActions.js";

const NAME_PROMPT = "Как зовут малыша? 👶";
const NAME_VALIDATION_MESSAGE = "Пожалуйста, введите имя текстом.";
const BIRTH_DATE_VALIDATION_MESSAGE = "Введите дату в формате дд.мм.гггг.";

async function askForName(conversation: BotConversation, ctx: BotContext): Promise<string> {
  while (true) {
    await ctx.reply(NAME_PROMPT);

    const nameMessage = await conversation.waitFor("message:text", {
      otherwise: async (invalidCtx) => {
        await invalidCtx.reply(NAME_VALIDATION_MESSAGE);
      }
    });

    const trimmedName = nameMessage.message.text.trim();
    if (trimmedName.length > 0) {
      return trimmedName;
    }

    await ctx.reply(NAME_VALIDATION_MESSAGE);
  }
}

async function askForBirthDate(conversation: BotConversation, ctx: BotContext, babyName: string): Promise<Date> {
  while (true) {
    await ctx.reply(`Когда родился ${babyName}? 🎂 (дд.мм.гггг)`);

    const dateMessage = await conversation.waitFor("message:text", {
      otherwise: async (invalidCtx) => {
        await invalidCtx.reply(BIRTH_DATE_VALIDATION_MESSAGE);
      }
    });

    const parsedDate = parseRuDateInput(dateMessage.message.text);
    if (parsedDate) {
      return parsedDate;
    }

    await ctx.reply(BIRTH_DATE_VALIDATION_MESSAGE);
  }
}

export async function onboardingConversation(
  conversation: BotConversation,
  ctx: BotContext,
  payload?: { userId: string }
): Promise<void> {
  if (!payload?.userId) {
    await ctx.reply("Не удалось определить пользователя. Попробуйте /start ещё раз.");
    return;
  }

  const existingBaby = await ctx.services.babyService.getBabyByUser(payload.userId);
  if (existingBaby) {
    await ctx.reply(`Вы уже состоите в дневнике ${existingBaby.name}.`);
    return;
  }

  const babyName = await askForName(conversation, ctx);
  const birthDate = await askForBirthDate(conversation, ctx, babyName);

  const baby = await ctx.services.babyService.createBaby({
    name: babyName,
    birthDate,
    ownerUserId: payload.userId
  });

  const inviteLink = ctx.services.inviteService.buildInviteLink(baby.inviteToken);

  await ctx.reply(
    [
      `🎉 Дневник для ${baby.name} создан!`,
      "",
      "📝 Что я умею:",
      "• Отправьте текст, фото или видео — сохраню в дневник",
      "• 🎤 Голосовое сообщение — расшифрую и сохраню текстом",
      "• 📊 /summary — AI-отчёт за месяц",
      "• ✏️ /edit — редактировать последнюю запись",
      "",
      "📱 В приложении:",
      "• Лента всех записей с фото и видео",
      "• Создание и редактирование записей",
      "• Загрузка фото и видео с телефона",
      "• AI-итоги по месяцам",
      "",
      `👨‍👩‍👦 Инвайт для второго родителя:\n${inviteLink}`
    ].join("\n"),
    { reply_markup: buildOpenDiaryKeyboard() }
  );
}
