const RU_MONTHS: readonly string[] = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
];

const RU_MONTHS_GENITIVE: readonly string[] = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];

/**
 * Inclusive UTC date range for a calendar month.
 * dateFrom = first day 00:00 UTC, dateTo = last day 00:00 UTC.
 */
export function getMonthDateRange(
  year: number,
  month: number
): { dateFrom: Date; dateTo: Date } {
  const dateFrom = new Date(Date.UTC(year, month - 1, 1));
  // day 0 of next month = last day of current month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dateTo = new Date(Date.UTC(year, month - 1, lastDay));
  return { dateFrom, dateTo };
}

/** "февраль 2026" */
export function formatRuMonth(year: number, month: number): string {
  return `${RU_MONTHS[month - 1]} ${year}`;
}

/** "февраля 2026" (genitive case, for "В феврале" style phrases) */
export function formatRuMonthGenitive(year: number, month: number): string {
  return `${RU_MONTHS_GENITIVE[month - 1]} ${year}`;
}
