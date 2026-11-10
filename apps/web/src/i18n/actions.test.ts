import { beforeEach, describe, expect, it, vi } from "vitest";

const setCookie = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }));
import { setLocale } from "./actions";

describe("language preference", () => {
  beforeEach(() => setCookie.mockReset());
  it.each(["en", "es", "pt-BR", "de", "fr", "nl-NL"])("stores a valid %s preference", async (locale) => {
    await setLocale(locale);
    expect(setCookie).toHaveBeenCalledWith("harly_locale", locale, expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });
  it("rejects unsupported values without setting a cookie", async () => {
    await expect(setLocale("../../en")).rejects.toThrow();
    expect(setCookie).not.toHaveBeenCalled();
  });
});
