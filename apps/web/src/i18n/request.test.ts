import { beforeEach, describe, expect, it, vi } from "vitest";

const getCookie = vi.hoisted(() => vi.fn());
const getHeader = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: getCookie }),
  headers: async () => ({ get: getHeader }),
}));
vi.mock("next-intl/server", () => ({ getRequestConfig: (callback: unknown) => callback }));
import request from "./request";

// The mock returns the request callback so we can exercise cookie validation.
const configure = request as unknown as () => Promise<{ locale: string; messages: Record<string, unknown> }>;

describe("locale request configuration", () => {
  beforeEach(() => {
    getCookie.mockReset();
    getHeader.mockReset();
  });
  it("uses English for missing or invalid preferences", async () => {
    expect((await configure()).locale).toBe("en");
    getCookie.mockReturnValue({ value: "../../es" });
    expect((await configure()).locale).toBe("en");
  });
  it("falls back to Accept-Language when no cookie is set", async () => {
    getHeader.mockReturnValue("de-DE,de;q=0.9");
    expect((await configure()).locale).toBe("de");
    getCookie.mockReturnValue({ value: "fr" });
    expect((await configure()).locale).toBe("fr");
  });
  it.each(["en", "es", "pt-BR", "de", "fr", "nl-NL"])("loads %s", async (locale) => {
    getCookie.mockReturnValue({ value: locale });
    const result = await configure();
    expect(result.locale).toBe(locale);
    expect(result.messages.forgotPassword).toBeDefined();
  });
});
