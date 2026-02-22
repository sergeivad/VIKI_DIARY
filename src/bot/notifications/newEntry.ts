import type { EntryItem } from "@prisma/client";

import type { NotificationService } from "../../services/notification.service.js";
import { getEntryPreviewText, getMediaCounts } from "../formatters/entry.js";

type NotifyAboutNewEntryInput = {
  notificationService: NotificationService;
  babyId: string;
  babyName: string;
  authorId: string;
  authorFirstName: string;
  items: EntryItem[];
};

export function buildNewEntryNotificationText(params: {
  authorFirstName: string;
  babyName: string;
  items: EntryItem[];
}): string {
  const lines = [
    `📝 ${params.authorFirstName} добавил(а) запись в дневник ${params.babyName}:`
  ];
  const preview = getEntryPreviewText(params.items, 100);
  if (preview) {
    lines.push(`«${preview}»`);
  }

  const { photoCount, videoCount } = getMediaCounts(params.items);
  if (photoCount > 0) {
    lines.push(`🖼 ${photoCount} фото`);
  }
  if (videoCount > 0) {
    lines.push(`🎥 ${videoCount} видео`);
  }

  return lines.join("\n");
}

export async function notifyMembersAboutNewEntry(
  input: NotifyAboutNewEntryInput
): Promise<void> {
  try {
    await input.notificationService.notifyOtherMembers({
      babyId: input.babyId,
      excludeUserId: input.authorId,
      text: buildNewEntryNotificationText({
        authorFirstName: input.authorFirstName,
        babyName: input.babyName,
        items: input.items
      })
    });
  } catch (error) {
    console.error("Failed to dispatch entry notification", {
      error,
      babyId: input.babyId
    });
  }
}
