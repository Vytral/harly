import { createTranslator } from "next-intl";
import { isLocale, type Locale } from "./config";
import { messagesFor } from "./catalogs";

/**
 * A translator for an explicit language, independent of the current request.
 * Use it where the reader is not the signed-in user, for example the recipient
 * of an email rendered by a background worker. Unknown languages use English.
 */
export function translatorFor(locale: string | null | undefined, namespace: string) {
  const resolved: Locale = locale && isLocale(locale) ? locale : "en";
  return createTranslator({
    locale: resolved,
    messages: messagesFor(resolved),
    namespace: namespace as never,
  }) as unknown as (key: string, values?: Record<string, string | number | Date>) => string;
}
