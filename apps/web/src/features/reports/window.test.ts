import { describe, expect, it } from "vitest";

import {
  allTimeWindow,
  addCalendarDays,
  dayLabel,
  isInWindow,
  isValidTimeZone,
  localDateKey,
  localMonthKey,
  monthLabel,
  normalizeTimeZone,
  percentChange,
  previousWindow,
  resolveWindow,
  trailingMonths,
  zonedMidnight,
  zonedParts,
} from "./window";

const HOUR = 3_600_000;
const LA = "America/Los_Angeles";
const AUCKLAND = "Pacific/Auckland";

describe("time zone validation", () => {
  it("accepts IANA names and rejects unknown ones", () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("falls back to UTC for NULL, blank or unknown workspace settings", () => {
    expect(normalizeTimeZone(null)).toBe("UTC");
    expect(normalizeTimeZone(undefined)).toBe("UTC");
    expect(normalizeTimeZone("  ")).toBe("UTC");
    expect(normalizeTimeZone("Not/AZone")).toBe("UTC");
    expect(normalizeTimeZone(AUCKLAND)).toBe(AUCKLAND);
  });
});

describe("zoned wall clock", () => {
  it("reads the wall clock in the zone, not in UTC", () => {
    // 2026-02-01T07:30Z is 23:30 on Jan 31 in Los Angeles (PST, UTC-8).
    const instant = new Date("2026-02-01T07:30:00.000Z");
    expect(zonedParts(instant, LA)).toMatchObject({ year: 2026, month: 1, day: 31, hour: 23, minute: 30 });
    expect(localDateKey(instant, LA)).toBe("2026-01-31");
    expect(localDateKey(instant, "UTC")).toBe("2026-02-01");
  });

  it("buckets months in the zone so a late-evening local date stays in the old month", () => {
    const instant = new Date("2026-02-01T07:30:00.000Z");
    expect(localMonthKey(instant, LA)).toBe("2026-01");
    expect(localMonthKey(instant, "UTC")).toBe("2026-02");
  });

  it("finds local midnight on both sides of a DST transition", () => {
    // Spring forward in Los Angeles: 2026-03-08 02:00 PST becomes 03:00 PDT.
    expect(zonedMidnight({ year: 2026, month: 3, day: 8 }, LA).toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(zonedMidnight({ year: 2026, month: 3, day: 9 }, LA).toISOString()).toBe(
      "2026-03-09T07:00:00.000Z",
    );
    // Fall back: 2026-11-01 is still PDT, 2026-11-02 is PST.
    expect(zonedMidnight({ year: 2026, month: 11, day: 1 }, LA).toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
    expect(zonedMidnight({ year: 2026, month: 11, day: 2 }, LA).toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
  });

  it("handles the southern hemisphere DST start in Pacific/Auckland", () => {
    // Auckland moves to NZDT (UTC+13) on 2026-09-27; midnight is still NZST (UTC+12).
    expect(zonedMidnight({ year: 2026, month: 9, day: 27 }, AUCKLAND).toISOString()).toBe(
      "2026-09-26T12:00:00.000Z",
    );
    expect(zonedMidnight({ year: 2026, month: 9, day: 28 }, AUCKLAND).toISOString()).toBe(
      "2026-09-27T11:00:00.000Z",
    );
  });

  it("adds calendar days without any time-of-day arithmetic", () => {
    expect(addCalendarDays({ year: 2026, month: 2, day: 28 }, 1)).toEqual({ year: 2026, month: 3, day: 1 });
    expect(addCalendarDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({ year: 2025, month: 12, day: 31 });
    expect(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("resolveWindow", () => {
  it("covers whole local days, today included, across the spring-forward change", () => {
    // Now is 2026-03-10 05:00 PDT, so the 30 local days end with 2026-03-10.
    const now = new Date("2026-03-10T12:00:00.000Z");
    const window = resolveWindow(30, LA, now);
    expect(window.from.toISOString()).toBe("2026-02-09T08:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-03-11T07:00:00.000Z");
    // One local day is 23 hours in March, so 30 local days are 719 real hours.
    expect((window.to.getTime() - window.from.getTime()) / HOUR).toBe(719);
    expect(window.days).toBe(30);
    expect(window.timeZone).toBe(LA);
  });

  it("covers 30 local days across fall-back (25-hour day) in Los Angeles", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    const window = resolveWindow(30, LA, now);
    expect((window.to.getTime() - window.from.getTime()) / HOUR).toBe(30 * 24 + 1);
  });

  it("uses the zone's date rather than UTC's when the two disagree", () => {
    // 2026-10-28 02:00Z is still 2026-10-27 in Los Angeles.
    const now = new Date("2026-10-28T02:00:00.000Z");
    const inLa = resolveWindow(1, LA, now);
    const inUtc = resolveWindow(1, "UTC", now);
    expect(inLa.from.toISOString()).toBe("2026-10-27T07:00:00.000Z");
    expect(inUtc.from.toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("falls back to UTC when given an unknown zone", () => {
    const window = resolveWindow(7, "Nowhere/Land", new Date("2026-05-10T12:00:00.000Z"));
    expect(window.timeZone).toBe("UTC");
    expect(window.from.toISOString()).toBe("2026-05-04T00:00:00.000Z");
  });

  it("produces an equal-length, contiguous previous window", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const current = resolveWindow(30, LA, now);
    const previous = previousWindow(current, now);
    expect(previous.to.getTime()).toBe(current.from.getTime());
    expect(localDateKey(previous.from, LA)).toBe("2026-01-10");
    expect(localDateKey(previous.to, LA)).toBe("2026-02-09");
  });

  it("refuses to compute a previous period for the all-time window", () => {
    expect(() => previousWindow(allTimeWindow(LA), new Date())).toThrow();
  });
});

describe("window membership", () => {
  const window = resolveWindow(30, LA, new Date("2026-03-10T12:00:00.000Z"));

  it("includes the exact start and excludes the exact end", () => {
    expect(isInWindow(window.from, window)).toBe(true);
    expect(isInWindow(new Date(window.from.getTime() - 1), window)).toBe(false);
    expect(isInWindow(window.to, window)).toBe(false);
    expect(isInWindow(new Date(window.to.getTime() - 1), window)).toBe(true);
  });

  it("rejects unparseable timestamps instead of matching them", () => {
    expect(isInWindow("not a date", window)).toBe(false);
  });

  it("gives the all-time window every recorded instant", () => {
    const all = allTimeWindow(LA);
    expect(isInWindow(new Date("2015-06-01T00:00:00.000Z"), all)).toBe(true);
    expect(all.days).toBeNull();
  });
});

describe("trailing months", () => {
  it("returns twelve zone-local month keys, oldest first, and their window", () => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    const { keys, window } = trailingMonths(12, LA, now);
    expect(keys[0]).toBe("2025-11");
    expect(keys[11]).toBe("2026-10");
    expect(keys).toHaveLength(12);
    expect(window.from.toISOString()).toBe("2025-11-01T07:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });

  it("crosses the year boundary correctly for Pacific/Auckland", () => {
    const { keys } = trailingMonths(3, AUCKLAND, new Date("2026-01-15T00:00:00.000Z"));
    expect(keys).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("keeps the month boundary at local midnight, not UTC midnight", () => {
    // 2026-02-28 23:00 PST is already 2026-03-01 07:00Z; February is still the local month.
    const now = new Date("2026-03-01T07:00:00.000Z");
    const { keys, window } = trailingMonths(1, LA, now);
    expect(keys).toEqual(["2026-02"]);
    expect(window.from.toISOString()).toBe("2026-02-01T08:00:00.000Z");
    // 07:00Z on Mar 1 is still Feb 28 in Los Angeles, so it is inside February.
    expect(isInWindow(new Date("2026-03-01T07:00:00.000Z"), window)).toBe(true);
    expect(isInWindow(new Date("2026-03-01T08:00:00.000Z"), window)).toBe(false);
  });
});

describe("percent change", () => {
  it("returns null when there is no previous value to compare against", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(percentChange(5, undefined)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("rounds to a whole percent and handles decreases and negative baselines", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(0, 4)).toBe(-100);
    expect(percentChange(10, 3)).toBe(233);
    expect(percentChange(-5, -10)).toBe(50);
  });
});

describe("bucket labels", () => {
  it("labels months and days without shifting them into another zone", () => {
    expect(monthLabel("2026-02")).toBe("Feb");
    expect(monthLabel("2026-12")).toBe("Dec");
    expect(dayLabel("2026-10-01")).toBe("Oct 1");
    expect(dayLabel("2026-03-31")).toBe("Mar 31");
  });
});

describe("zonedMidnight stability", () => {
  it("returns an instant whose wall clock reads the requested date", () => {
    for (const zone of [LA, AUCKLAND, "Europe/London", "Asia/Kolkata"]) {
      const midnight = zonedMidnight({ year: 2026, month: 6, day: 15 }, zone);
      expect(localDateKey(midnight, zone)).toBe("2026-06-15");
    }
  });
});
