import { describe, expect, it } from "vitest";

import { parseStoredPreferences } from "./cookie-consent";

describe("parseStoredPreferences", () => {
  it("reads an explicit embed choice", () => {
    expect(parseStoredPreferences(JSON.stringify({ necessary: true, embeds: true }), null)).toEqual({
      necessary: true,
      embeds: true,
    });
  });

  it("does not treat a legacy accept-all as permission to load embeds", () => {
    expect(
      parseStoredPreferences(
        JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true }),
        "true",
      ),
    ).toEqual({ necessary: true, embeds: false });
  });

  it("remembers a legacy dismissal without enabling embeds", () => {
    expect(parseStoredPreferences(null, "true")).toEqual({ necessary: true, embeds: false });
  });

  it("returns null when nobody has chosen yet", () => {
    expect(parseStoredPreferences(null, null)).toBeNull();
  });
});
