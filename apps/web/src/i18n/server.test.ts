import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    throw new Error("outside request scope");
  },
  getLocale: async () => {
    throw new Error("outside request scope");
  },
}));

import { getLocale, getTranslations } from "./server";

describe("server translators outside a request", () => {
  it("falls back to the English catalog", async () => {
    const t = await getTranslations("language");
    expect(t("label")).toBe("Language");
  });
  it("accepts the object form with a namespace", async () => {
    const t = await getTranslations({ namespace: "language" } as never);
    expect(t("label")).toBe("Language");
  });
  it("falls back to English for the locale", async () => {
    expect(await getLocale()).toBe("en");
  });
});
