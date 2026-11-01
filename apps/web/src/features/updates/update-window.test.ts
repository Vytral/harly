import { describe, expect, it } from "vitest";

import {
  isWithinUpdateWindow,
  nextUpdateWindowStart,
  validateUpdateWindow,
  type UpdateWindow,
} from "./update-window";

const weeknights: UpdateWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 2,
  endHour: 5,
  timezone: "America/New_York",
};

// 2026-03-02 is a Monday; 2026-03-07 a Saturday. New York is UTC-5 until DST
// starts on 2026-03-08, so 07:00Z is 02:00 local.
const at = (iso: string) => new Date(iso);

describe("isWithinUpdateWindow", () => {
  it("is open inside the window on an allowed day", () => {
    expect(isWithinUpdateWindow(at("2026-03-02T07:00:00Z"), weeknights)).toBe(true);
    expect(isWithinUpdateWindow(at("2026-03-02T09:59:59Z"), weeknights)).toBe(true);
  });

  it("treats the end hour as exclusive and the start hour as inclusive", () => {
    expect(isWithinUpdateWindow(at("2026-03-02T06:59:59Z"), weeknights)).toBe(false);
    expect(isWithinUpdateWindow(at("2026-03-02T10:00:00Z"), weeknights)).toBe(false);
  });

  it("reads the wall clock in the window's time zone, not UTC", () => {
    // 03:00Z Monday is 22:00 Sunday in New York: outside the window.
    expect(isWithinUpdateWindow(at("2026-03-02T03:00:00Z"), weeknights)).toBe(false);
    expect(
      isWithinUpdateWindow(at("2026-03-02T03:00:00Z"), { ...weeknights, timezone: "UTC" }),
    ).toBe(true);
  });

  it("is closed on days that are not selected", () => {
    expect(isWithinUpdateWindow(at("2026-03-07T07:00:00Z"), weeknights)).toBe(false);
  });

  it("follows daylight saving time", () => {
    // After 2026-03-08 New York is UTC-4: 06:00Z is 02:00 local, 05:00Z is 01:00.
    expect(isWithinUpdateWindow(at("2026-03-09T06:00:00Z"), weeknights)).toBe(true);
    expect(isWithinUpdateWindow(at("2026-03-09T05:00:00Z"), weeknights)).toBe(false);
  });

  describe("a window that crosses midnight", () => {
    const overnight: UpdateWindow = {
      days: [5], // Friday nights only
      startHour: 22,
      endHour: 5,
      timezone: "UTC",
    };

    it("covers the evening of the selected day", () => {
      expect(isWithinUpdateWindow(at("2026-03-06T22:00:00Z"), overnight)).toBe(true);
    });

    it("belongs to the day it starts on, so the early morning after is open", () => {
      expect(isWithinUpdateWindow(at("2026-03-07T04:59:00Z"), overnight)).toBe(true);
      expect(isWithinUpdateWindow(at("2026-03-07T05:00:00Z"), overnight)).toBe(false);
    });

    it("is closed on the early morning of the selected day itself", () => {
      // Friday 03:00 follows Thursday's evening, which is not selected.
      expect(isWithinUpdateWindow(at("2026-03-06T03:00:00Z"), overnight)).toBe(false);
    });

    it("wraps Sunday evening into Monday morning", () => {
      const sundayNight: UpdateWindow = { ...overnight, days: [7] };
      expect(isWithinUpdateWindow(at("2026-03-02T01:00:00Z"), sundayNight)).toBe(true);
    });
  });

  it("works in zones with half-hour offsets", () => {
    const india: UpdateWindow = { ...weeknights, timezone: "Asia/Kolkata" };
    // 20:30Z Sunday is 02:00 Monday IST.
    expect(isWithinUpdateWindow(at("2026-03-01T20:30:00Z"), india)).toBe(true);
    expect(isWithinUpdateWindow(at("2026-03-01T20:29:00Z"), india)).toBe(false);
  });

  it("fails closed on an invalid window", () => {
    const now = at("2026-03-02T07:00:00Z");
    expect(isWithinUpdateWindow(now, { ...weeknights, timezone: "Mars/Olympus" })).toBe(false);
    expect(isWithinUpdateWindow(now, { ...weeknights, days: [] })).toBe(false);
    expect(isWithinUpdateWindow(now, { ...weeknights, startHour: 3, endHour: 3 })).toBe(false);
  });
});

describe("validateUpdateWindow", () => {
  it("accepts the default weeknight window", () => {
    expect(validateUpdateWindow(weeknights)).toBeNull();
  });

  it("rejects out-of-range days and hours", () => {
    expect(validateUpdateWindow({ ...weeknights, days: [0] })).not.toBeNull();
    expect(validateUpdateWindow({ ...weeknights, days: [8] })).not.toBeNull();
    expect(validateUpdateWindow({ ...weeknights, endHour: 24 })).not.toBeNull();
    expect(validateUpdateWindow({ ...weeknights, startHour: 1.5 })).not.toBeNull();
  });
});

describe("nextUpdateWindowStart", () => {
  it("returns now when the window is already open", () => {
    const now = at("2026-03-02T08:00:00Z");
    expect(nextUpdateWindowStart(now, weeknights)).toEqual(now);
  });

  it("finds the next opening, skipping closed days", () => {
    // Saturday afternoon: the next window opens Monday 02:00 New York, which is
    // 06:00Z because DST has started by then.
    expect(nextUpdateWindowStart(at("2026-03-07T18:00:00Z"), weeknights)?.toISOString()).toBe(
      "2026-03-09T06:00:00.000Z",
    );
  });

  it("returns null for an invalid window", () => {
    expect(nextUpdateWindowStart(new Date(), { ...weeknights, days: [] })).toBeNull();
  });
});
