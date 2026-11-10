export const supportedEmailLocales = [
  "en",
  "es",
  "pt-BR",
  "de",
  "fr",
  "nl-NL",
] as const;

export type EmailLocale = (typeof supportedEmailLocales)[number];

/** Normalize a saved or externally supplied locale without guessing. */
export function normalizeEmailLocale(value: unknown): EmailLocale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (
    supportedEmailLocales.find(
      (locale) => locale.toLowerCase() === normalized,
    ) ?? null
  );
}

/** Legacy rows and unsupported preferences use English until the recipient chooses a supported locale. */
export function resolveEmailLocale(value: unknown): EmailLocale {
  return normalizeEmailLocale(value) ?? "en";
}

/** Check canonical tags when validating values written to persistent storage. */
export function isEmailLocale(value: unknown): value is EmailLocale {
  return (
    typeof value === "string" &&
    (supportedEmailLocales as readonly string[]).includes(value)
  );
}
