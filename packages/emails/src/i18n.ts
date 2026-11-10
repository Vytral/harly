import { createTranslator } from "next-intl";
import {
  resolveEmailLocale as resolveRecipientEmailLocale,
  supportedEmailLocales,
  type EmailLocale,
} from "@harly/config/email-locale";
import en from "../messages/en.json";
import es from "../messages/es.json";
import ptBR from "../messages/pt-BR.json";
import de from "../messages/de.json";
import fr from "../messages/fr.json";
import nlNL from "../messages/nl-NL.json";

export const emailLocales = supportedEmailLocales;
const messages = { en, es, "pt-BR": ptBR, de, fr, "nl-NL": nlNL };

/** Locale must belong to the recipient. Unset or unsupported preferences fall back to English. */
export function resolveEmailLocale(
  recipientLocale?: string | null,
): EmailLocale {
  return resolveRecipientEmailLocale(recipientLocale);
}

export function emailTranslator(recipientLocale?: string | null) {
  const locale = resolveEmailLocale(recipientLocale);
  return createTranslator({ locale, messages: messages[locale] });
}
