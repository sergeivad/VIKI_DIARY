const DATE_INPUT_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TZ = "Europe/Moscow";

export function parseRuDateInput(input: string): Date | null {
  const trimmed = input.trim();
  const match = DATE_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatRuDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ
  }).format(date);
}

export function formatRuDateLong(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ
  }).format(date);
}

export function formatRuTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ
  }).format(date);
}

export function toUtcDateOnly(date: Date): Date {
  const moscowDate = date.toLocaleDateString("en-CA", { timeZone: TZ });
  const [y, m, d] = moscowDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
