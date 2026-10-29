import { describe, expect, it } from "vitest";

import { getBrowserTimeZone, NonexistentLocalTimeError, parseScheduledAt } from "./shared";

describe("interview date handling", () => {
  it("resolves a naive wall-clock value with the supplied IANA timezone", () => {
    expect(
      parseScheduledAt("2099-08-01T10:00", "America/Santiago").toISOString(),
    ).toBe("2099-08-01T14:00:00.000Z");
  });

  it("rejects a naive wall-clock value without an explicit timezone", () => {
    expect(() => parseScheduledAt("2099-08-01T10:00")).toThrow(
      /timezone/i,
    );
  });

  it("returns an IANA timezone in a browser runtime", () => {
    expect(getBrowserTimeZone()).toMatch(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/);
  });

  it("keeps ordinary local times unchanged across a DST-observing zone", () => {
    // Madrid is UTC+1 in winter and UTC+2 in summer.
    expect(parseScheduledAt("2099-01-15T10:00", "Europe/Madrid").toISOString()).toBe("2099-01-15T09:00:00.000Z");
    expect(parseScheduledAt("2099-07-15T10:00", "Europe/Madrid").toISOString()).toBe("2099-07-15T08:00:00.000Z");
  });

  it("rejects a local time that does not exist because the clocks skipped it, instead of silently moving it", () => {
    // 2026-03-29 02:30 never happens in Madrid: clocks jump from 02:00 to 03:00.
    expect(() => parseScheduledAt("2026-03-29T02:30", "Europe/Madrid")).toThrow(NonexistentLocalTimeError);
    expect(() => parseScheduledAt("2026-03-29T02:30", "Europe/Madrid")).toThrow(
      "That time does not exist in Europe/Madrid (clocks change).",
    );
  });

  it("accepts the local time just after the skipped hour", () => {
    expect(parseScheduledAt("2026-03-29T03:00", "Europe/Madrid").toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("picks the first occurrence of a repeated local time when the clocks fall back", () => {
    // 2026-10-25 02:30 happens twice in Madrid. The first occurrence is in summer time (UTC+2).
    expect(parseScheduledAt("2026-10-25T02:30", "Europe/Madrid").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
});
