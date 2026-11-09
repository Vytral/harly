import {
  isEmailLocale,
  supportedEmailLocales,
} from "@harly/config/email-locale";

export const locales = supportedEmailLocales;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return isEmailLocale(value);
}
