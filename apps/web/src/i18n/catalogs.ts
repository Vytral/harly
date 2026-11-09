import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt-BR.json";
import de from "../../messages/de.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl-NL.json";
import type { Locale } from "./config";
import { mergeMessages } from "./messages";

export const catalogs = { en, es, "pt-BR": pt, de, fr, "nl-NL": nl };

/** Full messages for a language, with English filling any gap. */
export function messagesFor(locale: Locale) {
  return mergeMessages(en, catalogs[locale]);
}
