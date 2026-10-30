import { describe, expect, it } from "vitest";

import {
  formatInterviewWhen,
  isValidTimeZone,
  resolveInterviewTimeZone,
} from "./interview-time";

describe("interview time formatting", () => {
  it("prints an explicit zone label for a winter-time Madrid slot", () => {
    // 2026-11-04 14:00 UTC is 15:00 in Madrid (CET, after the late-October change).
    const when = new Date("2026-11-04T14:00:00Z");
    expect(formatInterviewWhen(when, "Europe/Madrid")).toBe("Wed, 4 Nov 2026, 3:00 PM (Europe/Madrid)");
  });

  it("follows DST: the same UTC instant shows a different local hour across the spring change", () => {
    // Madrid moves to CEST (UTC+2) on 29 March 2026.
    expect(formatInterviewWhen(new Date("2026-03-20T15:00:00Z"), "Europe/Madrid")).toContain("4:00 PM");
    expect(formatInterviewWhen(new Date("2026-04-20T15:00:00Z"), "Europe/Madrid")).toContain("5:00 PM");
  });

  it("handles non-hour offsets (India is UTC+05:30)", () => {
    const when = new Date("2026-11-04T04:15:00Z");
    expect(formatInterviewWhen(when, "Asia/Kolkata")).toBe("Wed, 4 Nov 2026, 9:45 AM (Asia/Kolkata)");
  });

  it("handles a zone with a 45-minute offset and a daylight-saving rule (Chatham)", () => {
    // Chatham is UTC+13:45 in January (daylight time) and UTC+12:45 in July.
    expect(formatInterviewWhen(new Date("2026-01-15T00:00:00Z"), "Pacific/Chatham")).toBe(
      "Thu, 15 Jan 2026, 1:45 PM (Pacific/Chatham)",
    );
    expect(formatInterviewWhen(new Date("2026-07-15T00:00:00Z"), "Pacific/Chatham")).toBe(
      "Wed, 15 Jul 2026, 12:45 PM (Pacific/Chatham)",
    );
  });

  it("renders in UTC with a UTC label when the zone is missing (older queued payloads)", () => {
    const when = new Date("2026-11-04T14:00:00Z");
    expect(formatInterviewWhen(when, undefined)).toBe("Wed, 4 Nov 2026, 2:00 PM (UTC)");
    expect(formatInterviewWhen(when, null)).toBe("Wed, 4 Nov 2026, 2:00 PM (UTC)");
  });

  it("falls back to UTC for an invalid zone instead of throwing", () => {
    const when = new Date("2026-11-04T14:00:00Z");
    expect(formatInterviewWhen(when, "Not/AZone")).toBe("Wed, 4 Nov 2026, 2:00 PM (UTC)");
  });

  it("renders midnight as 12:xx AM", () => {
    const when = new Date("2026-11-04T00:30:00Z");
    expect(formatInterviewWhen(when, "UTC")).toBe("Wed, 4 Nov 2026, 12:30 AM (UTC)");
  });
});

describe("interview time zone resolution", () => {
  it("prefers the request zone, then the scheduler profile zone, then UTC", () => {
    expect(resolveInterviewTimeZone("America/Santiago", "Europe/Madrid")).toBe("America/Santiago");
    expect(resolveInterviewTimeZone(null, "Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolveInterviewTimeZone(undefined, undefined)).toBe("UTC");
  });

  it("skips invalid candidates", () => {
    expect(resolveInterviewTimeZone("bogus", "Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolveInterviewTimeZone("  ", null)).toBe("UTC");
  });

  it("recognises only real IANA zones", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("EST5EDT-nope")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
