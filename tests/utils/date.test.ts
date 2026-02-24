import { describe, expect, it } from "vitest";

import {
  formatRuDate,
  formatRuDateLong,
  formatRuTime,
  parseRuDateInput,
  toUtcDateOnly
} from "../../src/utils/date.js";

describe("date utils", () => {
  it("parses dd.mm.yyyy", () => {
    const parsed = parseRuDateInput("22.02.2026");
    expect(parsed?.toISOString()).toBe("2026-02-22T00:00:00.000Z");
  });

  it("returns null for invalid date", () => {
    expect(parseRuDateInput("31.02.2026")).toBeNull();
    expect(parseRuDateInput("2026-02-22")).toBeNull();
  });

  it("formats date for RU locale", () => {
    expect(formatRuDate(new Date("2026-02-22T00:00:00.000Z"))).toBe("22.02.2026");
  });

  it("formats long date for RU locale", () => {
    expect(formatRuDateLong(new Date("2026-02-22T00:00:00.000Z"))).toBe("22 февраля 2026 г.");
  });

  it("formats time in Moscow timezone", () => {
    expect(formatRuTime(new Date("2026-02-22T14:30:00.000Z"))).toBe("17:30");
  });

  it("returns date-only value based on Moscow timezone", () => {
    expect(toUtcDateOnly(new Date("2026-02-22T14:30:00.000Z")).toISOString()).toBe(
      "2026-02-22T00:00:00.000Z"
    );
    // 23:59 UTC = 02:59 next day in Moscow
    expect(toUtcDateOnly(new Date("2026-02-22T23:59:00.000Z")).toISOString()).toBe(
      "2026-02-23T00:00:00.000Z"
    );
  });
});
