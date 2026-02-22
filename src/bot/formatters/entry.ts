import { EntryItemType, type EntryItem } from "@prisma/client";

import { formatRuDateLong } from "../../utils/date.js";

type HistoryEntryAuthor = {
  firstName: string;
};

type HistoryRenderableEntry = {
  eventDate: Date;
  author: HistoryEntryAuthor;
  items: EntryItem[];
};

type MediaCounts = {
  photoCount: number;
  videoCount: number;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function getMediaCounts(items: EntryItem[]): MediaCounts {
  return items.reduce<MediaCounts>(
    (acc, item) => {
      if (item.type === EntryItemType.photo) {
        acc.photoCount += 1;
      } else if (item.type === EntryItemType.video) {
        acc.videoCount += 1;
      }

      return acc;
    },
    { photoCount: 0, videoCount: 0 }
  );
}

export function formatMediaSummary(items: EntryItem[]): string | null {
  const { photoCount, videoCount } = getMediaCounts(items);
  const parts: string[] = [];

  if (photoCount > 0) {
    parts.push(`🖼 ${photoCount} фото`);
  }
  if (videoCount > 0) {
    parts.push(`🎥 ${videoCount} видео`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" · ");
}

export function getHistoryTextContent(items: EntryItem[]): string {
  const textItems = items
    .filter((item) => item.type === EntryItemType.text)
    .map((item) => normalizeText(item.textContent))
    .filter((item): item is string => Boolean(item));

  if (textItems.length === 0) {
    return "—";
  }

  return textItems.join("\n\n");
}

export function getEntryPreviewText(items: EntryItem[], maxLength = 100): string | null {
  const fragments = items
    .map((item) => normalizeText(item.textContent))
    .filter((item): item is string => Boolean(item));

  if (fragments.length === 0) {
    return null;
  }

  return truncateText(fragments.join(" "), maxLength);
}

export function formatHistoryEntryMessage(entry: HistoryRenderableEntry): string {
  const header = `📝 ${formatRuDateLong(entry.eventDate)} — ${entry.author.firstName}`;
  const body = getHistoryTextContent(entry.items);
  const mediaSummary = formatMediaSummary(entry.items);

  if (!mediaSummary) {
    return `${header}\n\n${body}`;
  }

  return `${header}\n\n${body}\n\n${mediaSummary}`;
}
