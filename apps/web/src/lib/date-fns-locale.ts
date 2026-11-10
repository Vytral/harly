import type { Locale } from "date-fns";
import { de, enUS, es, fr, nl, ptBR } from "date-fns/locale";

const dateFnsLocales: Partial<Record<string, Locale>> = {
  en: enUS,
  es,
  "pt-BR": ptBR,
  de,
  fr,
  "nl-NL": nl,
};

/** Maps an app locale (next-intl) to the matching date-fns locale. Falls back to English. */
export function dateFnsLocale(locale: string): Locale {
  return dateFnsLocales[locale] ?? enUS;
}
