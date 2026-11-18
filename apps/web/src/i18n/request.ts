import { isDemoMode } from "@harly/config";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "./config";
import { messagesFor } from "./catalogs";
import { negotiateLocale } from "./negotiate";

export default getRequestConfig(async () => {
  const preference = (await cookies()).get("harly_locale")?.value;
  // Saved cookie first; otherwise the browser's Accept-Language; otherwise English.
  // The public demo ignores Accept-Language so every visitor starts in English
  // until they pick a language explicitly.
  const locale: Locale =
    preference && isLocale(preference)
      ? preference
      : isDemoMode()
        ? defaultLocale
        : negotiateLocale((await headers()).get("accept-language"));
  return { locale, messages: messagesFor(locale) };
});
