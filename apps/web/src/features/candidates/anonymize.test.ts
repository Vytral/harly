import { describe, expect, it } from "vitest";

import {
  REDACTED_PLACEHOLDER,
  anonymizedInitials,
  redactLines,
  redactText,
} from "./anonymize";

const identity = { firstName: "Ada", lastName: "Lovelace", fullName: "Ada Lovelace" };

describe("anonymize", () => {
  it("masks the candidate's name inside free text (case-insensitive)", () => {
    const out = redactText("ADA led the project; ask ada lovelace directly.", identity);
    expect(out).not.toMatch(/ada/i);
    expect(out).toContain(REDACTED_PLACEHOLDER);
  });

  it("does not over-redact short 2-letter names inside unrelated words", () => {
    const li = { firstName: "Li", lastName: "Chen", fullName: "Li Chen" };
    const out = redactText("Li improved quality for every client.", li);
    // Whole-word "Li" is masked, but "li" inside quality/client is untouched.
    expect(out).toContain("quality");
    expect(out).toContain("client");
    expect(out).toMatch(/^•+ improved quality for every client\.$/);
  });

  it("masks emails and phone-length numbers but keeps years intact", () => {
    const out = redactText("Reach me at ada@x.io or +1 (312) 847-1928. Shipped in 2024.", identity);
    expect(out).not.toContain("ada@x.io");
    expect(out).not.toContain("847-1928");
    expect(out).toContain("2024");
  });

  it("returns null/empty inputs unchanged", () => {
    expect(redactText(null, identity)).toBeNull();
    expect(redactText(undefined, identity)).toBeNull();
    expect(redactText("", identity)).toBe("");
  });

  it("drops lines that become empty after redaction", () => {
    const lines = ["Ada Lovelace", "Led analytics revamp", ""];
    const out = redactLines(lines, identity);
    expect(out).toContain("Led analytics revamp");
    expect(out.some((l) => l.includes("Led"))).toBe(true);
    // The pure-name line collapses to a placeholder, not an empty string.
    expect(out.every((l) => l.trim().length > 0)).toBe(true);
  });

  it("derives up-to-two-letter initials, or '?' when unknown", () => {
    expect(anonymizedInitials(identity)).toBe("AL");
    expect(anonymizedInitials({ firstName: "Grace" })).toBe("G");
    expect(anonymizedInitials({})).toBe("?");
  });
});
