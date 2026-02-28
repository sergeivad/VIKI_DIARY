import { describe, expect, it } from "vitest";

import {
  formatRuMonth,
  formatRuMonthGenitive,
  getMonthDateRange
} from "../../src/utils/month.js";

describe("month utils", () => {
  describe("getMonthDateRange", () => {
    it("returns correct range for February 2026", () => {
      const { dateFrom, dateTo } = getMonthDateRange(2026, 2);
      expect(dateFrom.toISOString()).toBe("2026-02-01T00:00:00.000Z");
      expect(dateTo.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    });

    it("returns correct range for leap year February", () => {
      const { dateFrom, dateTo } = getMonthDateRange(2024, 2);
      expect(dateFrom.toISOString()).toBe("2024-02-01T00:00:00.000Z");
      expect(dateTo.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    });

    it("returns correct range for January", () => {
      const { dateFrom, dateTo } = getMonthDateRange(2026, 1);
      expect(dateFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(dateTo.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    });

    it("returns correct range for December", () => {
      const { dateFrom, dateTo } = getMonthDateRange(2025, 12);
      expect(dateFrom.toISOString()).toBe("2025-12-01T00:00:00.000Z");
      expect(dateTo.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    });
  });

  describe("formatRuMonth", () => {
    it("formats month in nominative case", () => {
      expect(formatRuMonth(2026, 2)).toBe("февраль 2026");
      expect(formatRuMonth(2026, 1)).toBe("январь 2026");
      expect(formatRuMonth(2025, 12)).toBe("декабрь 2025");
    });
  });

  describe("formatRuMonthGenitive", () => {
    it("formats month in genitive case", () => {
      expect(formatRuMonthGenitive(2026, 2)).toBe("февраля 2026");
      expect(formatRuMonthGenitive(2026, 5)).toBe("мая 2026");
    });
  });
});
