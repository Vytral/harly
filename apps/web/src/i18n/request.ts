import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt-BR.json";
import de from "../../messages/de.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl-NL.json";
import { isLocale, type Locale } from "./config";
import { mergeMessages } from "./messages";
import { negotiateLocale } from "./negotiate";

const catalogs = { en, es, "pt-BR": pt, de, fr, "nl-NL": nl };

export default getRequestConfig(async () => {
  const preference = (await cookies()).get("harly_locale")?.value;
  // Saved cookie first; otherwise the browser's Accept-Language; otherwise English.
  const locale: Locale =
    preference && isLocale(preference)
      ? preference
      : negotiateLocale((await headers()).get("accept-language"));
  return { locale, messages: mergeMessages(en, catalogs[locale]) };
});
