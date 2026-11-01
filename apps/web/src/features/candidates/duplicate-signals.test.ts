import { describe, expect, it } from "vitest";

import {
  ACCENT_FROM,
  ACCENT_TO,
  containsPattern,
  escapeLikePattern,
  foldName,
  normalizeLinkedinUrl,
  normalizePhone,
  phoneKey,
  sharedIdentitySignals,
} from "./duplicate-signals";

describe("SQL accent translation table", () => {
  it("maps each accented character to a base letter", () => {
    expect(Array.from(ACCENT_FROM).length).toBe(Array.from(ACCENT_TO).length);
    Array.from(ACCENT_FROM).forEach((char, i) => {
      expect(foldName(char)).toBe(Array.from(ACCENT_TO)[i]);
    });
  });
});

describe("foldName", () => {
  it("is accent- and case-insensitive", () => {
    expect(foldName("José  Núñez")).toBe("jose nunez");
    expect(foldName("JOSE NUNEZ")).toBe(foldName("josé núñez"));
    expect(foldName("Zoë Müller")).toBe("zoe muller");
  });
  it("handles null", () => expect(foldName(null)).toBe(""));
});

describe("LIKE escaping", () => {
  it("escapes %, _ and backslash", () => {
    expect(escapeLikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");
    expect(containsPattern("O_Brien")).toBe("%O\\_Brien%");
  });
});

describe("normalizePhone / phoneKey", () => {
  it("strips formatting", () => {
    expect(normalizePhone("+54 (11) 5555-1234")).toBe("541155551234");
    expect(normalizePhone("0054 11 5555 1234")).toBe("541155551234");
  });
  it("rejects too-short values", () => expect(normalizePhone("12345")).toBeNull());
  it("matches the same number written differently", () => {
    expect(phoneKey("+54 11 5555-1234")).toBe(phoneKey("(011) 5555 1234"));
  });
});

describe("normalizeLinkedinUrl", () => {
  it("extracts a lowercase slug regardless of scheme, www, query and trailing slash", () => {
    const expected = "ana-torres";
    for (const url of [
      "https://www.linkedin.com/in/Ana-Torres/",
      "http://linkedin.com/in/ana-torres?trk=public",
      "linkedin.com/in/ana-torres#about",
      "https://es.linkedin.com/in/ANA-TORRES/",
    ]) {
      expect(normalizeLinkedinUrl(url)).toBe(expected);
    }
  });
  it("decodes percent-encoded accents", () => {
    expect(normalizeLinkedinUrl("https://linkedin.com/in/jos%C3%A9-nu%C3%B1ez")).toBe("jose-nunez");
  });
  it("returns null for non-profile URLs", () => {
    expect(normalizeLinkedinUrl("https://example.com/in/ana")).toBeNull();
    expect(normalizeLinkedinUrl("")).toBeNull();
  });
});

describe("sharedIdentitySignals", () => {
  it("finds every shared signal", () => {
    expect(
      sharedIdentitySignals(
        { email: "A@x.com", phone: "+1 555 010 0200", linkedinUrl: "https://linkedin.com/in/ana/" },
        { email: "a@X.com", phone: "555-010-0200", linkedinUrl: "linkedin.com/in/Ana" },
      ),
    ).toEqual(["email", "phone", "linkedin"]);
  });
  it("returns nothing for different people", () => {
    expect(sharedIdentitySignals({ email: "a@x.com", phone: "5550100200" }, { email: "b@x.com", phone: "5550999999" })).toEqual([]);
  });
});
