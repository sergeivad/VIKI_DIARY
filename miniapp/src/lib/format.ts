import type { DiaryEntry } from "@/api/types";

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatDateRu(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function groupEntriesByDate(
  entries: DiaryEntry[],
): { date: string; label: string; entries: DiaryEntry[] }[] {
  const map = new Map<string, DiaryEntry[]>();

  for (const entry of entries) {
    const existing = map.get(entry.eventDate);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(entry.eventDate, [entry]);
    }
  }

  const groups: { date: string; label: string; entries: DiaryEntry[] }[] = [];
  for (const [date, dateEntries] of map) {
    groups.push({
      date,
      label: formatDateRu(date),
      entries: dateEntries,
    });
  }

  return groups;
}
