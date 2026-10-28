import { describe, expect, it } from "vitest";

import {
  MATCH_RANK,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MAX_TOKENS,
  clampSearchLimit,
  highlightRanges,
  matchRank,
  mergeRanges,
  normalizeSearchQuery,
} from "./query";

describe("normalizeSearchQuery", () => {
  it("trims, collapses whitespace and lowercases for matching", () => {
    const query = normalizeSearchQuery("   Ada   \t  LOVELACE  ");
    expect(query).not.toBeNull();
    expect(query!.text).toBe("Ada LOVELACE");
    expect(query!.lower).toBe("ada lovelace");
    expect(query!.tokens).toEqual(["ada", "lovelace"]);
  });

  it("returns null for empty, whitespace-only and non-string input", () => {
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("   \n\t ")).toBeNull();
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery(42)).toBeNull();
  });

  it("escapes LIKE metacharacters in every pattern it produces", () => {
    const query = normalizeSearchQuery("100%_ready\\now");
    expect(query!.containsPattern).toBe("%100\\%\\_ready\\\\now%");
    expect(query!.prefixPattern).toBe("100\\%\\_ready\\\\now%");
    expect(query!.tokenContainsPatterns).toEqual(["%100\\%\\_ready\\\\now%"]);
  });

  it("caps the length and the number of tokens", () => {
    const long = normalizeSearchQuery("x".repeat(500));
    expect(long!.text).toHaveLength(SEARCH_MAX_QUERY_LENGTH);

    const many = normalizeSearchQuery(
      "one two three four five six seven eight nine",
    );
    expect(many!.tokens).toHaveLength(SEARCH_MAX_TOKENS);
    expect(many!.tokens[0]).toBe("one");
  });

  it("does not split a surrogate pair when capping", () => {
    const emoji = "🙂".repeat(SEARCH_MAX_QUERY_LENGTH + 5);
    const query = normalizeSearchQuery(emoji);
    expect(Array.from(query!.text)).toHaveLength(SEARCH_MAX_QUERY_LENGTH);
  });
});

describe("clampSearchLimit", () => {
  it("defaults, floors, and bounds the per-group limit", () => {
    expect(clampSearchLimit(undefined)).toBe(6);
    expect(clampSearchLimit(Number.NaN)).toBe(6);
    expect(clampSearchLimit(0)).toBe(1);
    expect(clampSearchLimit(3.9)).toBe(3);
    expect(clampSearchLimit(1000)).toBe(12);
  });
});

describe("highlightRanges", () => {
  it("finds each token case-insensitively", () => {
    expect(highlightRanges("Senior Engineer", ["engineer"])).toEqual([
      { start: 7, end: 15 },
    ]);
  });

  it("returns every occurrence of a token", () => {
    expect(highlightRanges("ada and ADA", ["ada"])).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);
  });

  it("merges overlapping and adjacent matches", () => {
    expect(highlightRanges("abcdef", ["abc", "bcd", "ef"])).toEqual([
      { start: 0, end: 6 },
    ]);
  });

  it("ignores empty tokens and returns nothing when nothing matches", () => {
    expect(highlightRanges("Ada", [""])).toEqual([]);
    expect(highlightRanges("Ada", ["zed"])).toEqual([]);
  });

  it("returns no ranges when lowercasing would shift offsets", () => {
    // U+0130 lowercases to two code units, so offsets would no longer line up.
    expect(highlightRanges("İstanbul", ["stanbul"])).toEqual([]);
  });
});

describe("mergeRanges", () => {
  it("sorts and merges ranges", () => {
    expect(
      mergeRanges([
        { start: 5, end: 7 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 6, end: 9 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });
});

describe("matchRank", () => {
  const query = normalizeSearchQuery("ada")!;

  it("ranks an exact value first, then a prefix, then anything else", () => {
    expect(matchRank(query, ["ADA"], [])).toBe(MATCH_RANK.exact);
    expect(matchRank(query, [], ["Ada Lovelace"])).toBe(MATCH_RANK.prefix);
    expect(matchRank(query, [], ["Grace Ada"])).toBe(MATCH_RANK.contains);
  });

  it("treats missing values as non-matches", () => {
    expect(matchRank(query, [null, undefined], [null])).toBe(MATCH_RANK.contains);
  });

  it("sorts an exact email ahead of a prefix name", () => {
    const emailQuery = normalizeSearchQuery("ada@example.com")!;
    const exact = matchRank(emailQuery, ["Ada@Example.com"], []);
    const prefix = matchRank(emailQuery, [], ["ada@example.com.au"]);
    expect(exact).toBeLessThan(prefix);
  });
});
