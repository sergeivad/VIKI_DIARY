import { describe, expect, it } from "vitest";

import { formatRuDate, formatRuTime, parseRuDateInput, toUtcDateOnly } from "../../src/utils/date.js";

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

  it("formats time in UTC", () => {
    expect(formatRuTime(new Date("2026-02-22T14:30:00.000Z"))).toBe("14:30");
  });

  it("returns UTC date-only value", () => {
    expect(toUtcDateOnly(new Date("2026-02-22T14:30:00.000Z")).toISOString()).toBe(
      "2026-02-22T00:00:00.000Z"
    );
  });
});
