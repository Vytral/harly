import { describe, expect, it } from "vitest";

import { deriveUpdaterToken, isValidUpdaterToken } from "./updater-token";

describe("updater token", () => {
  // The CLI test (tooling/harly/test/updater.test.mjs) asserts this same value.
  it("is a stable HMAC of the cron secret", () => {
    expect(deriveUpdaterToken("cron-secret")).toBe(
      "76e21df626b2cb100ef4f62d87b6c746d17926c1bee2036fdf285db3e7e69979",
    );
  });

  it("accepts only the derived token", () => {
    const token = deriveUpdaterToken("cron-secret");
    expect(isValidUpdaterToken(token, "cron-secret")).toBe(true);
    expect(isValidUpdaterToken("cron-secret", "cron-secret")).toBe(false);
    expect(isValidUpdaterToken(token, "other-secret")).toBe(false);
    expect(isValidUpdaterToken(null, "cron-secret")).toBe(false);
    expect(isValidUpdaterToken(token, undefined)).toBe(false);
  });
});
