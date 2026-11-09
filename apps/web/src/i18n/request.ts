import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isLocale, type Locale } from "./config";
import { messagesFor } from "./catalogs";
import { negotiateLocale } from "./negotiate";

export default getRequestConfig(async () => {
  const preference = (await cookies()).get("harly_locale")?.value;
  // Saved cookie first; otherwise the browser's Accept-Language; otherwise English.
  const locale: Locale =
    preference && isLocale(preference)
      ? preference
      : negotiateLocale((await headers()).get("accept-language"));
  return { locale, messages: messagesFor(locale) };
});
