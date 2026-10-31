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
