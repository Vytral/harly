import { describe, expect, it } from "vitest";

import { addUtcMonths, failureBackoffMs, nextRetryAt, nextRun, nextRunAfter } from "./cadence";

const d = (iso: string) => new Date(iso);

describe("scheduled report cadence", () => {
  it("clamps monthly runs to the last day instead of spilling into the next month", () => {
    expect(addUtcMonths(d("2026-01-31T09:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T09:00:00.000Z");
    expect(addUtcMonths(d("2028-01-31T09:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T09:00:00.000Z");
    expect(addUtcMonths(d("2026-03-31T09:00:00.000Z"), 1).toISOString()).toBe("2026-04-30T09:00:00.000Z");
    expect(addUtcMonths(d("2026-12-15T09:00:00.000Z"), 1).toISOString()).toBe("2027-01-15T09:00:00.000Z");
  });

  it("does not drift after a short month", () => {
    // Jan 31 -> Feb 28 -> Mar 28: drift is acceptable, but it must never skip a month.
    const feb = nextRun("monthly", d("2026-01-31T09:00:00.000Z"));
    const mar = nextRun("monthly", feb);
    expect(feb.getUTCMonth()).toBe(1);
    expect(mar.getUTCMonth()).toBe(2);
  });

  it("keeps daily and weekly steps exact", () => {
    expect(nextRun("daily", d("2026-02-28T09:00:00.000Z")).toISOString()).toBe("2026-03-01T09:00:00.000Z");
    expect(nextRun("weekly", d("2026-02-28T09:00:00.000Z")).toISOString()).toBe("2026-03-07T09:00:00.000Z");
  });
});

describe("scheduled report cadence in the workspace time zone", () => {
  it("keeps the local wall-clock time across a daylight-saving change", () => {
    // 09:00 in New York on Sat Mar 7 2026 (EST, UTC-5); DST starts Mar 8.
    const before = d("2026-03-07T14:00:00.000Z");
    expect(nextRun("daily", before, "America/New_York").toISOString()).toBe("2026-03-08T13:00:00.000Z");
    // In UTC the same step stays exactly 24 hours.
    expect(nextRun("daily", before).toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("steps weekly and monthly by calendar, clamping short months", () => {
    expect(nextRun("weekly", d("2026-03-04T14:00:00.000Z"), "America/New_York").toISOString()).toBe("2026-03-11T13:00:00.000Z");
    expect(nextRun("monthly", d("2026-01-31T14:00:00.000Z"), "America/New_York").toISOString()).toBe("2026-02-28T14:00:00.000Z");
    expect(nextRun("monthly", d("2026-12-15T14:00:00.000Z"), "Asia/Tokyo").toISOString()).toBe("2027-01-15T14:00:00.000Z");
  });

  it("uses the zone's calendar day, not the UTC day", () => {
    // 23:30 in Tokyo on Mar 1 is still Feb 28 in UTC.
    expect(nextRun("daily", d("2026-02-28T14:30:00.000Z"), "Asia/Tokyo").toISOString()).toBe("2026-03-01T14:30:00.000Z");
  });

  it("anchors on the slot and skips missed slots with one catch-up", () => {
    const slot = d("2026-03-01T09:00:00.000Z");
    const now = d("2026-03-04T09:30:00.000Z");
    expect(nextRunAfter("daily", slot, now).toISOString()).toBe("2026-03-05T09:00:00.000Z");
    expect(nextRunAfter("daily", slot, d("2026-03-01T09:05:00.000Z")).toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });
});

describe("failure backoff", () => {
  it("doubles from 15 minutes and is capped", () => {
    expect([1, 2, 3, 4].map(failureBackoffMs)).toEqual([15, 30, 60, 120].map((m) => m * 60_000));
    expect(failureBackoffMs(10)).toBe(12 * 3_600_000);
    expect(failureBackoffMs(500)).toBe(12 * 3_600_000);
  });

  it("never retries later than the schedule's next regular slot", () => {
    const slot = d("2026-03-01T09:00:00.000Z");
    const now = d("2026-03-01T09:00:00.000Z");
    expect(nextRetryAt("daily", slot, now, 1).toISOString()).toBe("2026-03-01T09:15:00.000Z");
    expect(nextRetryAt("daily", slot, now, 10).toISOString()).toBe("2026-03-01T21:00:00.000Z");
    const late = d("2026-03-01T22:00:00.000Z");
    expect(nextRetryAt("daily", slot, late, 10).toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });
});
