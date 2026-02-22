import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { Context } from "grammy";

import type { BabyService } from "../services/baby.service.js";
import type { DiaryService } from "../services/diary.service.js";
import type { InviteService } from "../services/invite.service.js";
import type { UserService } from "../services/user.service.js";

export type Services = {
  userService: UserService;
  babyService: BabyService;
  inviteService: InviteService;
  diaryService: DiaryService;
};

export type BotContext = Context & ConversationFlavor<Context> & { services: Services };

export type BotConversation = Conversation<BotContext, BotContext>;
