/**
 * Deterministic identity redaction for bias-reduced review and for text sent to
 * AI providers.
 *
 * This is intentionally NOT an AI call: redaction must be explainable and
 * repeatable. It masks identity signals (names and name variants, emails, phone
 * numbers, links and bare personal domains, social handles, street addresses)
 * so review and model prompts lean on skills and experience.
 *
 * Name matching is Unicode-aware: "José" matches "Jose" and "JOSÉ", names with
 * a trailing non-ASCII letter are masked, and separators such as "Jean-Luc" and
 * "Jean Luc" are treated alike. This is a best-effort filter over the text it is
 * given. It cannot remove a name the candidate's record does not know about
 * (for example a nickname that appears only in the resume).
 *
 * Shared by server (AI prompt building, candidate data shaping) and client, so it
 * stays free of server-only imports.
 */

export type CandidateIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

/** Opaque placeholder shown in place of a redacted value. */
export const REDACTED_PLACEHOLDER = "•••••••••";

// ── Emails, links, handles, addresses, phones ──────────────────────────────

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
// "ada [at] example [dot] com" and "ada (at) example.com" style obfuscation.
const OBFUSCATED_EMAIL_RE =
  /[\p{L}\p{N}._%+-]+\s*(?:\[at\]|\(at\))\s*[\p{L}\p{N}-]+(?:\s*(?:\[dot\]|\(dot\)|\bdot\b|\.)\s*[\p{L}\p{N}-]+)+/giu;
// Full URLs and scheme-less links (linkedin.com/in/x, github.com/x, ada.dev).
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/giu;
const BARE_DOMAIN_RE =
  /(?<![\p{L}\p{N}@.-])(?:[\p{L}\p{N}-]+\.)+(?:com|io|net|org|dev|me|co|app|ai|xyz|tech|info|us|uk|de|fr|es|br|ca|au|ly|tv|social)(?:\/[^\s<>"'`)\]]*)?(?![\p{L}\p{N}-])/giu;
// Social handles such as @ada_dev. Emails are removed before this runs.
const HANDLE_RE = /(?<![\p{L}\p{N}_])@[\p{L}\p{N}_]{2,30}(?![\p{L}\p{N}_])/gu;
// "221B Baker Street", "10 Downing St". Title-case words only, so prose such as
// "5 years at Main Street" survives.
const STREET_RE =
  /(?<![\p{L}\p{N}])\d{1,6}[A-Za-z]?\s+(?:[NSEW]\.?\s+)?(?:\p{Lu}[\p{L}.'’-]*\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Parkway|Pkwy|Square|Sq|Calle|Avenida|Rue|Strasse|Straße|Via|Rua)\b\.?/gu;
// Loose phone candidates; `isPhoneLike` decides which are phone numbers and not
// years, date ranges or counts.
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;
const LOCAL_PHONE_RE = /(?<!\d)\d{3}[\s.-]\d{4}(?!\d)/;

function isPhoneLike(match: string): boolean {
  const digits = match.replace(/\D/g, "").length;
  if (digits < 7) return false;
  const trimmed = match.trim();
  if (trimmed.startsWith("+") || /[()]/.test(trimmed)) return true;
  if (digits >= 10) return true;
  // "2019-2021" is a date range: eight digits in two groups stays intact.
  if (LOCAL_PHONE_RE.test(trimmed)) return true;
  const groups = trimmed.split(/[\s.-]+/).filter(Boolean).length;
  return groups >= 3 || digits >= 9;
}

// ── Name matching ──────────────────────────────────────────────────────────

/** Separator between name words: spaces, hyphens, dots and underscores. */
const NAME_SEPARATOR = "[\\s\\-._]+";
const ALPHANUMERIC = "\\p{L}\\p{N}_";

/** Letters that do not decompose under NFD and fold to a single base letter. */
const FOLD_OVERRIDES: Record<string, string> = {
  ł: "l",
  ø: "o",
  đ: "d",
  ħ: "h",
  ŧ: "t",
  ı: "i",
  ŀ: "l",
};

/** Letters that fold to more than one character. Matched as either form. */
const EXPANSIONS: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe" };

function baseLetter(lowerChar: string): string {
  const stripped = lowerChar.normalize("NFD").replace(/\p{M}/gu, "");
  return FOLD_OVERRIDES[stripped] ?? stripped;
}

/**
 * For each base Latin letter, every accented or case variant that folds to it.
 * Built once from the Latin-1, Latin Extended-A/B and Latin Extended Additional
 * blocks, so "e" also matches "é", "è", "ê", "ë", "ē", "ę", "ẹ" and so on.
 */
const LETTER_VARIANTS: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const add = (ch: string) => {
    const lower = ch.toLowerCase();
    const base = baseLetter(lower);
    if (base.length !== 1 || !/\p{L}/u.test(base)) return;
    if (EXPANSIONS[lower]) return;
    const set = map.get(base) ?? new Set<string>();
    set.add(lower);
    map.set(base, set);
  };
  const ranges: Array<[number, number]> = [
    [0x00c0, 0x024f],
    [0x1e00, 0x1eff],
  ];
  for (const [from, to] of ranges) {
    for (let cp = from; cp <= to; cp++) add(String.fromCodePoint(cp));
  }
  for (const key of Object.keys(FOLD_OVERRIDES)) add(key);
  for (let cp = 97; cp <= 122; cp++) add(String.fromCodePoint(cp));
  return map;
})();

function escapeLiteral(value: string): string {
  return value.replace(/[\^$\\.*+?()[\]{}|/]/g, "\\$&");
}

function charPattern(ch: string): string {
  const lower = ch.toLowerCase();
  const expansion = EXPANSIONS[lower];
  if (expansion) return `(?:${escapeLiteral(lower)}|${expansion})`;
  if (lower === "'" || lower === "’") return "['’]";
  const base = baseLetter(lower);
  const variants = base.length === 1 ? LETTER_VARIANTS.get(base) : undefined;
  if (variants) return `[${[...variants].join("")}]`;
  return escapeLiteral(lower);
}

/** Regex source matching one name value, tolerant of case, accents and separators. */
function tokenPattern(value: string): string {
  let out = "";
  let pendingSeparator = false;
  for (const ch of value.normalize("NFC")) {
    if (/[\s\-._]/u.test(ch)) {
      pendingSeparator = out.length > 0;
      continue;
    }
    if (pendingSeparator) {
      out += NAME_SEPARATOR;
      pendingSeparator = false;
    }
    out += charPattern(ch);
  }
  return out;
}

function cleanPart(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Every spelling of the candidate's name we should mask, longest first. */
function nameVariants(identity: CandidateIdentity): string[] {
  const parts = (identity.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = cleanPart(identity.firstName) ?? parts[0] ?? null;
  const last =
    cleanPart(identity.lastName) ?? (parts.length > 1 ? parts[parts.length - 1] : null);
  const full = cleanPart(identity.fullName) ?? [first, last].filter(Boolean).join(" ");

  const variants = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    // Single letters are too ambiguous to mask on their own.
    if (trimmed && [...trimmed].filter((ch) => /\p{L}/u.test(ch)).length >= 2) {
      variants.add(trimmed);
    }
  };

  add(full);
  if (first && last) {
    add(`${first} ${last}`);
    add(`${last} ${first}`);
    add(`${last}, ${first}`);
    // "John D" and "John D." (the trailing dot is ignored by the matcher).
    add(`${first} ${[...last][0]}`);
  }
  add(first);
  add(last);
  for (const part of parts) add(part);

  return [...variants].sort((a, b) => b.length - a.length);
}

function namePattern(identity: CandidateIdentity): RegExp | null {
  const alternatives = nameVariants(identity)
    .map(tokenPattern)
    .filter((source) => source.length > 0);
  if (alternatives.length === 0) return null;
  return new RegExp(
    `(?<![${ALPHANUMERIC}])(?:${alternatives.join("|")})(?![${ALPHANUMERIC}])`,
    "giu",
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Produce initials from a name for a neutral avatar fallback, e.g. "AL".
 * Returns "?" when no usable name is present.
 */
export function anonymizedInitials(identity: CandidateIdentity): string {
  const source =
    identity.fullName?.trim() ||
    [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
  if (!source) return "?";
  const letters = source
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  return letters.toUpperCase() || "?";
}

/**
 * Redact identity signals from a free-text block (summary, resume, notes, a
 * comment): the candidate's name and name variants, plus emails, phone numbers,
 * links, personal domains, social handles and street addresses. Returns the
 * input unchanged when `text` is null/empty. Pass an empty identity to strip the
 * generic identifiers only.
 */
export function redactText(
  text: string | null | undefined,
  identity: CandidateIdentity,
): string | null {
  if (!text) return text ?? null;
  let out = text
    .replace(EMAIL_RE, REDACTED_PLACEHOLDER)
    .replace(OBFUSCATED_EMAIL_RE, REDACTED_PLACEHOLDER)
    .replace(URL_RE, REDACTED_PLACEHOLDER)
    .replace(BARE_DOMAIN_RE, REDACTED_PLACEHOLDER)
    .replace(HANDLE_RE, REDACTED_PLACEHOLDER)
    .replace(STREET_RE, REDACTED_PLACEHOLDER)
    .replace(PHONE_CANDIDATE_RE, (match) =>
      isPhoneLike(match) ? REDACTED_PLACEHOLDER : match,
    );
  const names = namePattern(identity);
  if (names) out = out.replace(names, REDACTED_PLACEHOLDER);
  return out;
}

/** Redact an array of free-text lines, dropping any that become empty. */
export function redactLines(
  lines: readonly string[] | null | undefined,
  identity: CandidateIdentity,
): string[] {
  if (!lines) return [];
  return lines
    .map((line) => redactText(line, identity) ?? "")
    .filter((line) => line.trim().length > 0);
}
