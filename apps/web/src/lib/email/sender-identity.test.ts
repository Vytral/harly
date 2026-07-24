import { describe, expect, it } from "vitest";

import {
  PLATFORM_DEFAULT_DOMAIN,
  extractDomain,
  generateLocalPart,
  hasCustomSendingDomain,
} from "./sender-identity";

describe("extractDomain", () => {
  it("pulls the domain out of a display-name From string", () => {
    expect(extractDomain("Acme <hiring@acme.com>")).toBe("acme.com");
  });

  it("pulls the domain out of a bare address", () => {
    expect(extractDomain("hiring@acme.com")).toBe("acme.com");
  });

  it("lowercases the domain", () => {
    expect(extractDomain("Acme <Hiring@ACME.COM>")).toBe("acme.com");
  });

  it("returns null for missing/malformed input", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("not an email")).toBeNull();
  });
});

describe("hasCustomSendingDomain", () => {
  it("is false when email isn't enabled", () => {
    expect(
      hasCustomSendingDomain({ enabled: false, provider: "resend", from: "hiring@acme.com" }),
    ).toBe(false);
  });

  it("is false when no provider is configured", () => {
    expect(
      hasCustomSendingDomain({ enabled: true, provider: null, from: "hiring@acme.com" }),
    ).toBe(false);
  });

  it(`is false on the shared platform domain (${PLATFORM_DEFAULT_DOMAIN})`, () => {
    expect(
      hasCustomSendingDomain({
        enabled: true,
        provider: "resend",
        from: `Harly <noreply@${PLATFORM_DEFAULT_DOMAIN}>`,
      }),
    ).toBe(false);
  });

  it("is true once a workspace configures its own domain", () => {
    expect(
      hasCustomSendingDomain({ enabled: true, provider: "resend", from: "hiring@acme.com" }),
    ).toBe(true);
  });
});

describe("generateLocalPart", () => {
  it("joins first and last name with a dot", () => {
    expect(generateLocalPart("Benjamin Gonzalez")).toBe("benjamin.gonzalez");
  });

  it("ASCII-folds accents", () => {
    expect(generateLocalPart("José García")).toBe("jose.garcia");
  });

  it("collapses accented and unaccented spellings to the same local-part", () => {
    expect(generateLocalPart("José")).toBe(generateLocalPart("Jose"));
  });

  it("passes single-token names through as-is", () => {
    expect(generateLocalPart("Madonna")).toBe("madonna");
  });

  it("uses first and last token for names with a middle name", () => {
    expect(generateLocalPart("Ana Maria Fernandez")).toBe("ana.fernandez");
  });

  it("strips punctuation and non-ASCII noise", () => {
    expect(generateLocalPart("O'Brien-Smith")).toBe("obriensmith");
  });

  it("falls back to a safe default for empty input", () => {
    expect(generateLocalPart("   ")).toBe("member");
  });
});
