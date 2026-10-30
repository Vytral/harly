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

/** A calendar date at the start of a candidate: "2026-11-02", "2026-11-02 10". */
const ISO_DATE_PREFIX_RE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;

function isPhoneLike(match: string, offset: number, whole: string): boolean {
  const trimmed = match.trim();
  // Scheduling values survive: an ISO date (optionally followed by a time) or a
  // time component directly after the match ("2026-11-02 10" + ":30") is not a phone.
  if (ISO_DATE_PREFIX_RE.test(trimmed)) return false;
  if (whole.charAt(offset + match.length) === ":") return false;
  const digits = match.replace(/\D/g, "").length;
  if (digits < 7) return false;
  if (trimmed.startsWith("+") || /[()]/.test(trimmed)) return true;
  if (digits >= 10) return true;
  // "2019-2021" is a date range: eight digits in two groups stays intact.
  if (LOCAL_PHONE_RE.test(trimmed)) return true;
  const groups = trimmed.split(/[\s.-]+/).filter(Boolean).length;
  return groups >= 3 || digits >= 9;
}

// ── Name matching ──────────────────────────────────────────────────────────

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
/** Lowercase, accent-free and expansion-folded: the form every name word is compared in. */
const PREFILTER_SPECIAL_RE = /[łøđħŧıŀßæœ]/gu;
const PREFILTER_SPECIAL: Record<string, string> = { ...FOLD_OVERRIDES, ß: "ss", æ: "ae", œ: "oe" };

function prefilterFold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(PREFILTER_SPECIAL_RE, (ch) => PREFILTER_SPECIAL[ch] ?? ch);
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

/** Words of a name: letters, digits and combining marks. Separators are never part of a word. */
const WORD_TOKEN_RE = /[\p{L}\p{M}\p{N}]+/gu;
/** Text allowed between two words of one name: spaces, hyphens, dots, underscores, commas, apostrophes. */
const NAME_GAP_RE = /^[\s\-._,'’]+$/u;
/** A day number after a month name, such as "May 12" or "May 1st". */
const DAY_NUMBER_RE = /^\d{1,2}(?:st|nd|rd|th)?$/iu;

type NameToken = { start: number; end: number; raw: string; folded: string };
type NameVariantWords = { words: string[]; singleWord: boolean };

function tokenize(text: string): NameToken[] {
  const tokens: NameToken[] = [];
  for (const match of text.matchAll(WORD_TOKEN_RE)) {
    const start = match.index ?? 0;
    tokens.push({
      start,
      end: start + match[0].length,
      raw: match[0],
      folded: prefilterFold(match[0]),
    });
  }
  return tokens;
}

/** Whether `variant` matches the words starting at token `at`, as whole words. */
function variantMatchesAt(
  text: string,
  tokens: readonly NameToken[],
  at: number,
  variant: NameVariantWords,
): boolean {
  const count = variant.words.length;
  if (at + count > tokens.length) return false;
  for (let offset = 0; offset < count; offset++) {
    if (tokens[at + offset]!.folded !== variant.words[offset]) return false;
  }
  for (let offset = 0; offset < count - 1; offset++) {
    const gap = text.slice(tokens[at + offset]!.end, tokens[at + offset + 1]!.start);
    if (!NAME_GAP_RE.test(gap)) return false;
  }
  if (variant.singleWord) {
    // "May 12" is a date, not the name May: a day number right after masks nothing.
    const next = tokens[at + 1];
    if (next && /^\s+$/u.test(text.slice(tokens[at]!.end, next.start)) && DAY_NUMBER_RE.test(next.raw)) {
      return false;
    }
  }
  return true;
}

/**
 * A single-word name is ambiguous ("May" is a month, "Will" a verb), so it is
 * masked only when it starts capitalised. Full names (two or more words) are
 * always masked.
 */
function isMaskableMatch(raw: string, singleWord: boolean): boolean {
  return !singleWord || /^\p{Lu}|^[^\p{Ll}]/u.test(raw);
}

/**
 * Builds a name redactor for a fixed set of identities. Names are compared word by
 * word in folded form (case, accents and separators ignored). A word index picks
 * the few identities whose words occur in a given text, so redacting many rows
 * stays linear in the text size.
 */
export function createNameRedactor(
  identities: readonly CandidateIdentity[],
): (text: string) => string {
  const matchers: Array<{ variants: NameVariantWords[] }> = [];
  for (const identity of identities) {
    const variants: NameVariantWords[] = [];
    for (const variant of nameVariants(identity)) {
      const words = prefilterFold(variant).split(/[\s\-._,'’]+/u).filter((word) => word.length > 0);
      if (words.length === 0) continue;
      variants.push({ words, singleWord: !/[\s\-._,'’]/u.test(variant.trim()) });
    }
    if (variants.length > 0) matchers.push({ variants });
  }
  if (matchers.length === 0) return (text) => text;

  // Longest variants first, so "Ada Lovelace" wins over "Ada" at the same position.
  for (const matcher of matchers) {
    matcher.variants.sort((a, b) => b.words.length - a.words.length);
  }

  const byWord = new Map<string, number[]>();
  const always: number[] = [];
  matchers.forEach((matcher, index) => {
    const words = new Set(matcher.variants.flatMap((variant) => variant.words).filter((word) => word.length >= 2));
    if (words.size === 0) always.push(index);
    for (const word of words) {
      const list = byWord.get(word);
      if (list) list.push(index);
      else byWord.set(word, [index]);
    }
  });

  return (text) => {
    if (!text) return text;
    const tokens = tokenize(text);
    const selected = new Set<number>(always);
    for (const token of tokens) {
      const list = byWord.get(token.folded);
      if (list) for (const index of list) selected.add(index);
    }
    if (selected.size === 0) return text;

    const spans: Array<[number, number]> = [];
    for (const index of selected) {
      const { variants } = matchers[index]!;
      for (let at = 0; at < tokens.length; at++) {
        for (const variant of variants) {
          if (!variantMatchesAt(text, tokens, at, variant)) continue;
          const last = tokens[at + variant.words.length - 1]!;
          if (isMaskableMatch(text.slice(tokens[at]!.start, last.end), variant.singleWord)) {
            spans.push([tokens[at]!.start, last.end]);
            at += variant.words.length - 1;
          }
          break;
        }
      }
    }
    if (spans.length === 0) return text;

    spans.sort((a, b) => a[0] - b[0]);
    let out = "";
    let cursor = 0;
    for (const [start, end] of spans) {
      if (start < cursor) {
        // Overlapping match from another identity: extend the masked span.
        if (end > cursor) cursor = end;
        continue;
      }
      out += text.slice(cursor, start) + REDACTED_PLACEHOLDER;
      cursor = end;
    }
    return out + text.slice(cursor);
  };
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
  const generic = text
    .replace(EMAIL_RE, REDACTED_PLACEHOLDER)
    .replace(OBFUSCATED_EMAIL_RE, REDACTED_PLACEHOLDER)
    .replace(URL_RE, REDACTED_PLACEHOLDER)
    .replace(BARE_DOMAIN_RE, REDACTED_PLACEHOLDER)
    .replace(HANDLE_RE, REDACTED_PLACEHOLDER)
    .replace(STREET_RE, REDACTED_PLACEHOLDER)
    .replace(PHONE_CANDIDATE_RE, (match, offset: number, whole: string) =>
      isPhoneLike(match, offset, whole) ? REDACTED_PLACEHOLDER : match,
    );
  return createNameRedactor([identity])(generic);
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
