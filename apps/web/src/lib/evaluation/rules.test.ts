import { describe, expect, it } from "vitest";

import { evaluateCandidateWithRules, RULES_EVALUATION_VERSION } from "./rules";

describe("Harly Algorithm rules-v3", () => {
  const job = {
    title: "Junior PHP Engineer",
    description: "Build web applications.",
    requirements: "PHP and Laravel experience.",
    experienceLevel: "junior",
    education: null,
    keywords: ["PHP", "Laravel", "Git"],
  };

  it("returns transparent criteria and a stable version", () => {
    const result = evaluateCandidateWithRules({
      job,
      candidate: {
        resumeText: "PHP Laravel Git developer with 2 years experience.",
        answers: [],
        experienceYears: 2,
      },
    });

    expect(RULES_EVALUATION_VERSION).toBe("rules-v3");
    expect(result.result.score).toBeGreaterThanOrEqual(80);
    expect(result.criterionResults.map((criterion) => criterion.label)).toContain("PHP");
    expect(result.criterionResults.filter((criterion) => criterion.status === "met").every((criterion) => criterion.evidence)).toBe(true);
  });

  it("penalizes missing evidence instead of inflating the score", () => {
    const result = evaluateCandidateWithRules({
      job,
      candidate: { resumeText: "PHP developer", answers: [] },
    });

    expect(result.criterionResults.length).toBeGreaterThan(1);
    expect(result.criterionResults[0]?.label).toBe("PHP");
    expect(result.result.score).toBeLessThan(70);
    expect(result.result.recommendation).not.toBe("strong_yes");
    expect(result.requiresHumanReview).toBe(true);
  });

  it("never calls a candidate a strong yes when a required criterion is unknown", () => {
    const result = evaluateCandidateWithRules({
      job: {
        ...job,
        requirements: "PHP and Laravel experience. SQL is required.",
        keywords: ["PHP", "Laravel", "SQL"],
      },
      candidate: {
        resumeText: "PHP Laravel developer.",
        answers: [],
      },
    });

    expect(result.result.recommendation).not.toBe("strong_yes");
    expect(result.criterionResults.find((criterion) => criterion.label === "SQL")?.status).toBe("unknown");
  });
});
