import { describe, expect, it } from "vitest";

import { getBrowserTimeZone, parseScheduledAt } from "./shared";

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
});
