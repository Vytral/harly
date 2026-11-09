import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { isLocale } from "./config";
import { mergeMessages } from "./messages";

describe("localization foundations", () => {
  it("retains English for untranslated and empty messages", () => {
    expect(mergeMessages(
      { common: { save: "Save", cancel: "Cancel" } },
      { common: { save: "Guardar", cancel: "" }, extra: "ignored" },
    )).toEqual({ common: { save: "Guardar", cancel: "Cancel" } });
  });

  it("formats ICU plural messages with the selected locale", () => {
    const t = createTranslator({
      locale: "es",
      messages: { count: "{count, plural, one {# candidato} other {# candidatos}}" },
    });
    expect(t("count", { count: 1 })).toBe("1 candidato");
    expect(t("count", { count: 3 })).toBe("3 candidatos");
  });

  it("accepts only configured locale identifiers", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("../../en")).toBe(false);
    expect(isLocale("pt-PT")).toBe(false);
  });
});
