import { defaultLocale, locales, type Locale } from "./config";

/** Map a browser language tag ("es-MX", "pt", "nl-BE") to a supported locale. */
function matchTag(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (!lower || lower === "*") return null;
  const exact = locales.find((locale) => locale.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split("-")[0];
  return locales.find((locale) => locale.toLowerCase().split("-")[0] === base) ?? null;
}

/**
 * Pick the best supported locale from an Accept-Language header.
 * Respects q-values, ignores malformed entries and falls back to English.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const match = matchTag(tag);
    if (match) return match;
  }
  return defaultLocale;
}
