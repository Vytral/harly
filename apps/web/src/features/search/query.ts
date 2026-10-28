import { escapeLikePattern } from "./patterns";

/**
 * Pure query handling shared by the server search and the palette. Nothing here
 * touches the database or the request, so the rules are unit-tested directly.
 */

export const SEARCH_MAX_QUERY_LENGTH = 100;
export const SEARCH_MAX_TOKENS = 6;
export const SEARCH_DEFAULT_LIMIT_PER_GROUP = 6;
export const SEARCH_MAX_LIMIT_PER_GROUP = 12;

export type NormalizedSearchQuery = {
  /** Trimmed, whitespace collapsed, capped. This is what the UI shows and the server echoes. */
  text: string;
  /** Lowercased `text`, used for exact and prefix comparisons. */
  lower: string;
  /** Lowercased, whitespace-separated tokens (at most {@link SEARCH_MAX_TOKENS}). */
  tokens: string[];
  /** `%phrase%` with LIKE metacharacters escaped. */
  containsPattern: string;
  /** `phrase%` with LIKE metacharacters escaped. */
  prefixPattern: string;
  /** One `%token%` pattern per token, each escaped. */
  tokenContainsPatterns: string[];
};

/**
 * Normalize raw user input. Returns null when nothing searchable remains, so the
 * caller can answer without touching the database.
 */
export function normalizeSearchQuery(raw: unknown): NormalizedSearchQuery | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const text = Array.from(collapsed).slice(0, SEARCH_MAX_QUERY_LENGTH).join("").trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const tokens = lower.split(" ").filter(Boolean).slice(0, SEARCH_MAX_TOKENS);
  const escaped = escapeLikePattern(lower);
  return {
    text,
    lower,
    tokens,
    containsPattern: `%${escaped}%`,
    prefixPattern: `${escaped}%`,
    tokenContainsPatterns: tokens.map((token) => `%${escapeLikePattern(token)}%`),
  };
}

export function clampSearchLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return SEARCH_DEFAULT_LIMIT_PER_GROUP;
  }
  return Math.min(SEARCH_MAX_LIMIT_PER_GROUP, Math.max(1, Math.floor(value)));
}

/** Half-open character range `[start, end)` into a display string. */
export type SearchRange = { start: number; end: number };

/**
 * Character ranges of every query token inside `text`, case-insensitively,
 * merged so overlapping or adjacent matches form one range. Returns no ranges
 * when lowercasing changes the string length, because offsets would drift.
 */
export function highlightRanges(
  text: string,
  tokens: readonly string[],
): SearchRange[] {
  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) return [];

  const found: SearchRange[] = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(token, from);
      if (index === -1) break;
      found.push({ start: index, end: index + token.length });
      from = index + token.length;
    }
  }
  return mergeRanges(found);
}

export function mergeRanges(ranges: readonly SearchRange[]): SearchRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SearchRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Match-quality tiers. Lower is better. The SQL in the server search applies
 * the same rules; {@link matchRank} is the reference the integration tests check
 * the database ordering against.
 */
export const MATCH_RANK = {
  exact: 0,
  prefix: 1,
  contains: 2,
} as const;

export function matchRank(
  query: NormalizedSearchQuery,
  exactValues: readonly (string | null | undefined)[],
  prefixValues: readonly (string | null | undefined)[],
): number {
  const exact = exactValues.some(
    (value) => typeof value === "string" && value.toLowerCase() === query.lower,
  );
  if (exact) return MATCH_RANK.exact;
  const prefix = prefixValues.some(
    (value) =>
      typeof value === "string" && value.toLowerCase().startsWith(query.lower),
  );
  return prefix ? MATCH_RANK.prefix : MATCH_RANK.contains;
}
