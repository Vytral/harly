import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { salvageCandidateScore } from "./score-candidate";

const base = {
  score: 78,
  recommendation: "yes",
  summary: "Strong growth evidence.",
  gaps: ["Senior experience not clearly met"],
  criteria: [{ label: "Paid acquisition", score: 62, evidence: "Cut CAC 28%" }],
};

describe("salvageCandidateScore", () => {
  it("recovers strengths sent as a string of half-escaped JSON (seen from Haiku)", () => {
    const text = JSON.stringify({
      ...base,
      strengths:
        '["Current Growth Marketing Manager title","Built analytics stack (GA4, dbt)"]," gaps":[]',
    });
    const result = salvageCandidateScore(text);
    expect(result?.strengths).toEqual([
      "Current Growth Marketing Manager title",
      "Built analytics stack (GA4, dbt)",
    ]);
    expect(result?.gaps).toEqual(base.gaps);
  });

  it("parses a list sent as a JSON string", () => {
    const text = JSON.stringify({ ...base, strengths: '["A","B"]' });
    expect(salvageCandidateScore(text)?.strengths).toEqual(["A", "B"]);
  });

  it("returns null when the rest of the shape is wrong", () => {
    expect(salvageCandidateScore(JSON.stringify({ ...base, strengths: [], score: "high" }))).toBeNull();
    expect(salvageCandidateScore("not json")).toBeNull();
    expect(salvageCandidateScore(undefined)).toBeNull();
  });
});

import { isQuoteSupported, normalizeForQuote, truncateAtLine } from "./score-candidate";

describe("isQuoteSupported", () => {
  const resume = "Growth Marketing Manager\n- Cut blended CAC 28% in six months\n- Built GA4 + dbt stack";
  it("accepts exact and whitespace/case-insensitive quotes", () => {
    expect(isQuoteSupported("cut blended   CAC 28% in six months", resume)).toBe(true);
  });
  it("accepts pieces joined by an ellipsis", () => {
    expect(isQuoteSupported("Cut blended CAC 28% ... Built GA4 + dbt stack", resume)).toBe(true);
  });
  it("allows a small difference in a longer quote", () => {
    expect(isQuoteSupported("Cut the blended CAC 28% in six months", resume)).toBe(true);
  });
  it("rejects invented quotes", () => {
    expect(isQuoteSupported("Led a team of 40 engineers at Google", resume)).toBe(false);
    expect(isQuoteSupported("Cut CAC 80%", resume)).toBe(false);
  });
  it("normalizes accents and punctuation", () => {
    expect(normalizeForQuote("Café, ÉTÉ!")).toBe("cafe ete");
  });
});

describe("truncateAtLine", () => {
  it("cuts at a line boundary and reports truncation", () => {
    const text = `${"a".repeat(90)}\n${"b".repeat(50)}`;
    expect(truncateAtLine(text, 100)).toEqual({ text: "a".repeat(90), truncated: true });
    expect(truncateAtLine("short", 100)).toEqual({ text: "short", truncated: false });
  });
});
