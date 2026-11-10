import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./negotiate";

describe("negotiateLocale", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["es-MX,es;q=0.9,en;q=0.8", "es"],
    ["pt-PT", "pt-BR"],
    ["nl-BE,nl;q=0.8", "nl-NL"],
    ["de-AT", "de"],
    ["fr-CA,fr;q=0.9", "fr"],
    ["ja,en;q=0.5", "en"],
    ["en;q=0.4,fr;q=0.9", "fr"],
    ["es;q=0", "en"],
    ["*", "en"],
  ])("maps %s to %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });
});
