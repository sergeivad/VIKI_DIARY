import type { BotConversation, BotContext } from "../../types/bot.js";
import { formatRuDate, parseRuDateInput } from "../../utils/date.js";

const NAME_PROMPT = "Как зовут малыша?";
const NAME_VALIDATION_MESSAGE = "Пожалуйста, введите имя текстом.";
const BIRTH_DATE_PROMPT = "Когда родился? (дд.мм.гггг)";
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

async function askForBirthDate(conversation: BotConversation, ctx: BotContext): Promise<Date> {
  while (true) {
    await ctx.reply(BIRTH_DATE_PROMPT);

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
  const birthDate = await askForBirthDate(conversation, ctx);

  const baby = await ctx.services.babyService.createBaby({
    name: babyName,
    birthDate,
    ownerUserId: payload.userId
  });

  await ctx.reply(
    [
      `Дневник создан: ${baby.name}.`,
      `Дата рождения: ${formatRuDate(baby.birthDate)}.`,
      `Инвайт-ссылка для второго родителя: ${ctx.services.inviteService.buildInviteLink(baby.inviteToken)}`
    ].join("\n")
  );
}
