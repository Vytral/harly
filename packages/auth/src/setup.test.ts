import { describe, expect, it } from "vitest";

import {
  constantTimeSecretEqual,
  normalizeSetupEmail,
  setupClaimCookieName,
} from "./setup";

describe("secure deployment setup primitives", () => {
  it("compares equal and unequal-length tokens without throwing", () => {
    expect(constantTimeSecretEqual("correct-token", "correct-token")).toBe(true);
    expect(constantTimeSecretEqual("x", "a-much-longer-secret-token")).toBe(false);
  });

  it("normalizes the authorized email exactly once", () => {
    expect(normalizeSetupEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("uses a host-only secure cookie name for HTTPS", () => {
    expect(setupClaimCookieName("https://harly.example.com")).toBe(
      "__Host-harly-setup-claim",
    );
    expect(setupClaimCookieName("http://localhost:3000")).toBe("harly-setup-claim");
  });
});
