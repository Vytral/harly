import { describe, expect, it } from "vitest";
import { translatorFor } from "./translator";

describe("translatorFor", () => {
  it("translates in the requested language, independent of the request", () => {
    expect(translatorFor("en", "language")("label")).toBe("Language");
    expect(translatorFor("es", "language")("label")).toBe("Idioma");
    expect(translatorFor("de", "language")("label")).toBe("Sprache");
  });
  it("falls back to English for unknown or missing languages", () => {
    expect(translatorFor("xx", "language")("label")).toBe("Language");
    expect(translatorFor(null, "language")("label")).toBe("Language");
  });
});
