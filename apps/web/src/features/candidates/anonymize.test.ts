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

describe("anonymize: adversarial identity inputs", () => {
  it("matches names with accents against their unaccented spelling and back", () => {
    const jose = { firstName: "José", lastName: "Núñez", fullName: "José Núñez" };
    for (const text of ["Jose Nunez led it.", "JOSÉ NÚÑEZ led it.", "josé nuñez led it."]) {
      const out = redactText(text, jose) ?? "";
      expect(out).not.toMatch(/jos|nu.ez/i);
      expect(out).toContain("led it.");
    }
  });

  it("masks names that end in a non-ASCII letter (word boundaries are Unicode-aware)", () => {
    const zoe = { firstName: "Zoë", lastName: "Müller", fullName: "Zoë Müller" };
    const out = redactText("Zoë and Zoe Müller joined in 2021.", zoe) ?? "";
    expect(out).not.toMatch(/zo/i);
    expect(out).toContain("2021");
  });

  it("masks 'John D.' and 'Last, First' forms of the candidate's name", () => {
    const john = { firstName: "John", lastName: "Doe", fullName: "John Doe" };
    expect(redactText("Referred by John D. last year.", john)).not.toMatch(/John/);
    expect(redactText("Doe, John - referee.", john)).not.toMatch(/Doe|John/);
  });

  it("masks hyphenated and separated name variants interchangeably", () => {
    const jean = { firstName: "Jean-Luc", lastName: "Picard", fullName: "Jean-Luc Picard" };
    for (const text of ["Jean Luc Picard", "jean-luc picard", "Jean.Luc Picard"]) {
      const out = redactText(text, jean) ?? "";
      expect(out).not.toMatch(/picard/i);
    }
  });

  it("masks an email address that appears in the text", () => {
    expect(redactText("Contact: ada.l+jobs@mail.example.co.uk", identity)).not.toMatch(/example/);
  });

  it("masks obfuscated emails", () => {
    expect(redactText("write to ada [at] example [dot] com", identity)).not.toMatch(/example/);
    expect(redactText("write to ada (at) example.com", identity)).not.toMatch(/example/);
  });

  it.each([
    "+44 20 7946 0958",
    "(555) 123-4567",
    "555-123-4567",
    "+1.555.123.4567",
    "5551234567",
    "07946 0958",
    "555-1234",
  ])("masks phone format %s", (phone) => {
    const out = redactText(`Call ${phone} any time.`, identity) ?? "";
    expect(out).not.toContain(phone);
    expect(out).toContain("any time.");
  });

  it.each(["2019-2021", "2019 - 2021", "Jan 2019 - Mar 2021", "3 years, 2015"])(
    "keeps date ranges and counts intact: %s",
    (date) => {
      expect(redactText(`Worked ${date} at Acme.`, identity)).toContain(date);
    },
  );

  it.each([
    "github.com/adalovelace",
    "https://www.linkedin.com/in/ada-lovelace/",
    "www.example.org/ada",
    "linkedin.com/in/ada",
    "ada-portfolio.dev",
  ])("masks link %s", (link) => {
    const out = redactText(`Portfolio: ${link} shipped.`, identity) ?? "";
    expect(out).not.toContain(link);
    expect(out).toContain("shipped.");
  });

  it("masks social handles", () => {
    expect(redactText("Find me on @ada_codes today", identity)).not.toContain("@ada_codes");
  });

  it("masks title-case street addresses and keeps prose such as 'years at Main'", () => {
    expect(redactText("Lives at 221B Baker Street, London.", identity)).not.toContain("Baker Street");
    expect(redactText("5 years at Main Street Labs.", identity)).toContain("years at Main");
  });

  it("does not match a name inside a longer word", () => {
    const out = redactText("Adams and Adalovelace were not relevant.", identity) ?? "";
    expect(out).toContain("Adams");
    expect(out).toContain("Adalovelace");
  });

  it("redacts the candidate's name when only fullName is known", () => {
    const out = redactText("Grace Hopper built compilers.", { fullName: "Grace Hopper" }) ?? "";
    expect(out).not.toContain("Grace");
    expect(out).not.toContain("Hopper");
  });

  it("strips generic identifiers even with no identity", () => {
    const out = redactText("Mail me at x@y.io or github.com/x", {}) ?? "";
    expect(out).not.toContain("x@y.io");
    expect(out).not.toContain("github.com/x");
  });
});
