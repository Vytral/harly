/**
 * Deterministic resume/candidate anonymization for bias-reduced review.
 *
 * This is intentionally NOT an AI call: redaction must be explainable and
 * repeatable. We mask identity signals (name, email, phone, links, and any
 * occurrence of the candidate's name inside free text) so early screening leans
 * on skills and experience. Reviewers can always reveal a specific candidate.
 *
 * Shared by server (candidate data shaping) and client (reveal toggle), so it
 * stays free of server-only imports.
 */

export type CandidateIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

/** Opaque placeholder shown in place of a redacted value. */
export const REDACTED_PLACEHOLDER = "•••••••••";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Loose phone matcher: 7+ digits allowing spaces, dashes, parens, dots, leading +.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

/** Collapse a candidate's known name variants into distinct, non-empty tokens. */
function nameTokens(identity: CandidateIdentity): string[] {
  const parts = [
    identity.fullName,
    identity.firstName,
    identity.lastName,
    [identity.firstName, identity.lastName].filter(Boolean).join(" "),
  ];
  const tokens = new Set<string>();
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed.length >= 2) tokens.add(trimmed);
  }
  // Longest-first so "Ada Lovelace" is masked before "Ada" leaves a dangling surname.
  return [...tokens].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
 * Redact identity signals from a free-text block (summary, experience bullets):
 * the candidate's name, plus any email or phone number that slipped into prose.
 * Returns the input unchanged when `text` is null/empty.
 */
export function redactText(
  text: string | null | undefined,
  identity: CandidateIdentity,
): string | null {
  if (!text) return text ?? null;
  let out = text;
  for (const token of nameTokens(identity)) {
    out = out.replace(new RegExp(escapeRegExp(token), "gi"), REDACTED_PLACEHOLDER);
  }
  out = out.replace(EMAIL_RE, REDACTED_PLACEHOLDER);
  out = out.replace(PHONE_RE, (match) =>
    // Keep short numerics (years, counts) intact; only mask phone-length runs.
    match.replace(/\D/g, "").length >= 7 ? REDACTED_PLACEHOLDER : match,
  );
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
