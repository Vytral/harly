/**
 * Pure helpers for duplicate detection: accent-insensitive names, LIKE-pattern
 * escaping and phone / LinkedIn normalization. No database or server imports so
 * they can be unit tested directly.
 */

/** Latin letters with diacritics -> base letters; mirrored in SQL by `translate`. */
export const ACCENT_FROM = "áàäâãåéèëêíìïîóòöôõúùüûñçýÿ";
export const ACCENT_TO = "aaaaaaeeeeiiiiooooouuuuncyy";

/** Lowercase, strip combining accents, collapse whitespace. "José  Núñez" -> "jose nunez". */
export function foldName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Escape LIKE/ILIKE wildcards so a name like "100%" or "O_Brien" is matched
 * literally (Postgres' default escape character is backslash).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `%value%` pattern with wildcards in `value` escaped. */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

/** Digits only; null when too short to be a usable identifier. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 ? digits : null;
}

/** Compare by the trailing 9 digits so "+54 9 11 5555-1234" equals "011 5555 1234". */
export function phoneKey(value: string | null | undefined): string | null {
  const digits = normalizePhone(value);
  return digits ? digits.slice(-9) : null;
}

/** LinkedIn profile slug, lowercase and decoded: ".../in/Ana-Torres/?trk=x" -> "ana-torres". */
export function normalizeLinkedinUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i);
  if (!match) return null;
  let slug = match[1]!;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = foldName(slug).replace(/\s/g, "");
  return slug.length >= 2 ? slug : null;
}

export type DuplicateSignal = "email" | "phone" | "linkedin";

type Identity = { email?: string | null; phone?: string | null; linkedinUrl?: string | null };

/** Deterministic identity signals shared by two candidate records. */
export function sharedIdentitySignals(a: Identity, b: Identity): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const emailA = a.email?.trim().toLowerCase();
  if (emailA && emailA === b.email?.trim().toLowerCase()) signals.push("email");
  const phoneA = phoneKey(a.phone);
  if (phoneA && phoneA === phoneKey(b.phone)) signals.push("phone");
  const linkA = normalizeLinkedinUrl(a.linkedinUrl);
  if (linkA && linkA === normalizeLinkedinUrl(b.linkedinUrl)) signals.push("linkedin");
  return signals;
}

export function describeSignals(signals: DuplicateSignal[]): string {
  const labels: Record<DuplicateSignal, string> = {
    email: "same email",
    phone: "same phone number",
    linkedin: "same LinkedIn profile",
  };
  return signals.map((signal) => labels[signal]).join(" and ");
}
