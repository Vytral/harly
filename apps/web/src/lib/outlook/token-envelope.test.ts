import { describe, expect, it } from "vitest";

import {
  OUTLOOK_REFRESH_SKEW_MS,
  openOutlookAccessToken,
  outlookTokenNeedsRefresh,
  sealOutlookAccessToken,
} from "./token-envelope";

describe("outlook access token envelope", () => {
  it("round-trips the token and its expiry", () => {
    const expiresAt = new Date("2026-10-28T12:00:00.000Z");
    const opened = openOutlookAccessToken(sealOutlookAccessToken("eyJ.opaque-token", expiresAt));

    expect(opened).toEqual({ accessToken: "eyJ.opaque-token", expiresAt });
  });

  it("reads a bare token written before the envelope as expiry-unknown", () => {
    expect(openOutlookAccessToken("legacy-bare-token")).toEqual({
      accessToken: "legacy-bare-token",
      expiresAt: null,
    });
  });

  it("treats an invalid stored expiry as unknown", () => {
    const opened = openOutlookAccessToken(
      JSON.stringify({ v: 1, accessToken: "t", expiresAt: "not-a-date" }),
    );
    expect(opened).toEqual({ accessToken: "t", expiresAt: null });
  });

  it("refreshes when the expiry is unknown, past, or inside the skew window", () => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    expect(outlookTokenNeedsRefresh(null, now)).toBe(true);
    expect(outlookTokenNeedsRefresh(new Date(now.getTime() - 1), now)).toBe(true);
    expect(outlookTokenNeedsRefresh(new Date(now.getTime() + OUTLOOK_REFRESH_SKEW_MS), now)).toBe(true);
  });

  it("does not refresh a token that is comfortably valid", () => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    expect(outlookTokenNeedsRefresh(new Date(now.getTime() + 60 * 60_000), now)).toBe(false);
  });
});
