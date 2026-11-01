import { describe, expect, it } from "vitest";

import { isReservedTestEmail, magicLinkDelivery } from "./magic-link-delivery";

describe("magicLinkDelivery", () => {
  it("never logs a link in production, whatever the address or sender", () => {
    for (const email of ["a@acme.test", "a@example.com", "a@x.localhost"]) {
      for (const hasSender of [true, false]) {
        expect(magicLinkDelivery({ nodeEnv: "production", hasSender, email })).not.toBe("log");
      }
    }
  });

  it("sends real mail in production, including to reserved test domains", () => {
    expect(magicLinkDelivery({ nodeEnv: "production", hasSender: true, email: "a@acme.test" })).toBe("send");
    expect(magicLinkDelivery({ nodeEnv: "production", hasSender: false, email: "a@acme.com" })).toBe("drop");
  });

  it("logs in development for reserved domains or when no sender is configured", () => {
    expect(magicLinkDelivery({ nodeEnv: "development", hasSender: true, email: "a@acme.test" })).toBe("log");
    expect(magicLinkDelivery({ nodeEnv: "development", hasSender: false, email: "a@acme.com" })).toBe("log");
    expect(magicLinkDelivery({ nodeEnv: undefined, hasSender: true, email: "a@acme.com" })).toBe("send");
  });

  it("recognises reserved domains", () => {
    expect(isReservedTestEmail("x@host.example")).toBe(true);
    expect(isReservedTestEmail("x@example.com")).toBe(false);
  });
});
