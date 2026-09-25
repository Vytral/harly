/**
 * Focused regression tests for root fixes C1, C2, A1, taxonomy, evaluationMode, null scores.
 * Encodes correct behavior — not inventing green tests.
 */
import { describe, expect, it } from "vitest";

import { parseResumeFacts } from "./ats-parser";
import { buildStructuredCriteria } from "./criteria-builder";
import {
  applySemanticThresholds,
  DEFAULT_SEMANTIC_THRESHOLDS,
} from "./matching/semantic-assist";
import { thresholdsForMode } from "./mode";
import { evaluateCandidateWithRules } from "./rules";
import {
  isRelatedButNotEquivalent,
  resolveSkillConcept,
} from "./taxonomy/skill-concepts";
import { matchCriteriaAgainstFacts } from "./ats-matcher";

const REF = "2026-09-19";

describe("C1 — education default unknown", () => {
  it("does not invent bachelor when education line has no degree pattern", () => {
    const facts = parseResumeFacts(
      `Alex Candidate
alex@example.com

EDUCATION
Universidad de Chile — Computer Science 2018

EXPERIENCE
Engineer — Acme (2020 - 2022)
• Built APIs.
`,
      REF,
    );
    expect(facts.education.length).toBeGreaterThan(0);
    const entry = facts.education[0]!;
    expect(entry.normalizedLevel).toBe("unknown");
    expect(entry.levelRank).toBe(0);
  });

  it("assigns bachelor only when an explicit pattern matches", () => {
    const facts = parseResumeFacts(
      `Alex Candidate
alex@example.com

EDUCATION
Bachelor of Science in Computer Science — MIT (2018)

EXPERIENCE
Engineer — Acme (2020 - 2022)
• Built APIs.
`,
      REF,
    );
    expect(facts.highestEducation?.normalizedLevel).toBe("bachelor");
    expect(facts.highestEducation?.levelRank).toBe(3);
  });

  it("marks education criterion unknown when only unrecognized education exists", () => {
    const res = evaluateCandidateWithRules({
      job: {
        title: "Engineer",
        description: "Build things",
        requirements: null,
        experienceLevel: null,
        education: "Bachelor's",
        keywords: [],
        evaluationMode: "balanced",
      },
      candidate: {
        resumeText: `Pat
pat@example.com

EDUCATION
Some Online Bootcamp Certificate 2021

EXPERIENCE
Dev — Co (2022 - 2024)
• Shipped features.
`,
        answers: [],
      },
      referenceDate: REF,
    });
    const edu = res.criterionAssessments.find((c) => c.type === "education");
    expect(edu?.status).toBe("unknown");
    expect(edu?.rawScore).toBeNull();
  });
});

describe("C2 — rubric education minimumValue → rank", () => {
  it("maps education minimumValue to minimumEducationLevelRank (not hardcoded 3)", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Researcher",
        description: "",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: [],
      },
      candidate: { resumeText: null, answers: [] },
      rubric: {
        version: "test",
        criteria: [
          {
            key: "edu",
            label: "Education",
            type: "education",
            importance: "required",
            weight: 20,
            aliases: [],
            minimumValue: 4, // master's rank
          },
        ],
      },
    });
    expect(criteria[0]?.minimumEducationLevelRank).toBe(4);
    expect(criteria[0]?.minimumMonths).toBeUndefined();
  });

  it("honors explicit minimumEducationLevelRank on rubric criterion", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Researcher",
        description: "",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: [],
      },
      candidate: { resumeText: null, answers: [] },
      rubric: {
        version: "test",
        criteria: [
          {
            key: "edu",
            label: "Education",
            type: "education",
            importance: "required",
            weight: 20,
            aliases: [],
            minimumEducationLevelRank: 5,
          },
        ],
      },
    });
    expect(criteria[0]?.minimumEducationLevelRank).toBe(5);
  });

  it("does not invent bachelor rank from unparseable job.education", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Engineer",
        description: "",
        requirements: null,
        experienceLevel: null,
        education: "Relevant coursework preferred",
        keywords: [],
      },
      candidate: { resumeText: null, answers: [] },
    });
    const edu = criteria.find((c) => c.type === "education");
    expect(edu?.minimumEducationLevelRank).toBeUndefined();
  });
});

describe("Taxonomy — related ≠ equivalent", () => {
  it("does not treat AngularJS / MariaDB / EKS / Rails / Laravel / Tailwind as equivalent aliases", () => {
    expect(resolveSkillConcept("AngularJS").canonicalName).toBe("AngularJS");
    expect(resolveSkillConcept("AngularJS").conceptId).not.toBe(
      resolveSkillConcept("Angular").conceptId,
    );
    expect(resolveSkillConcept("MariaDB").canonicalName).toBe("MariaDB");
    expect(resolveSkillConcept("MariaDB").conceptId).not.toBe(
      resolveSkillConcept("MySQL").conceptId,
    );
    expect(resolveSkillConcept("EKS").canonicalName).toBe("EKS");
    expect(resolveSkillConcept("EKS").conceptId).not.toBe(
      resolveSkillConcept("Kubernetes").conceptId,
    );
    expect(resolveSkillConcept("Rails").canonicalName).toBe("Ruby on Rails");
    expect(resolveSkillConcept("Rails").conceptId).not.toBe(
      resolveSkillConcept("Ruby").conceptId,
    );
    expect(resolveSkillConcept("Laravel").canonicalName).toBe("Laravel");
    expect(resolveSkillConcept("Laravel").conceptId).not.toBe(
      resolveSkillConcept("PHP").conceptId,
    );
    expect(resolveSkillConcept("Tailwind").canonicalName).toBe("Tailwind CSS");
    expect(resolveSkillConcept("Tailwind").conceptId).not.toBe(
      resolveSkillConcept("CSS").conceptId,
    );
  });

  it("marks related taxonomy evidence as not_demonstrated, never automatic met", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Frontend Engineer",
        description: "",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: ["Angular"],
      },
      candidate: { resumeText: null, answers: [] },
    });
    const facts = parseResumeFacts(
      `Dev
dev@example.com

EXPERIENCE
FE — Co (2021 - 2023)
• Maintained legacy AngularJS dashboards.

SKILLS
AngularJS
`,
      REF,
    );
    const results = matchCriteriaAgainstFacts(criteria, facts);
    const angular = results.find((r) => r.label === "Angular");
    expect(angular?.status).toBe("not_demonstrated");
    expect(angular?.status).not.toBe("met");
    expect(angular?.status).not.toBe("partially_met");
    expect(isRelatedButNotEquivalent("Angular", "AngularJS")).toBe(true);
  });
});

describe("A1 — similarity required for semantic authority", () => {
  it("treats equivalent/related without similarity as non-authoritative", () => {
    expect(
      applySemanticThresholds(
        {
          sourceConcept: "A",
          targetConcept: "B",
          modelId: "m",
          decision: "equivalent",
        },
        DEFAULT_SEMANTIC_THRESHOLDS,
      ),
    ).toBeNull();
    expect(
      applySemanticThresholds(
        {
          sourceConcept: "A",
          targetConcept: "B",
          modelId: "m",
          similarity: Number.NaN,
          decision: "related",
        },
        DEFAULT_SEMANTIC_THRESHOLDS,
      ),
    ).toBeNull();
  });

  it("still promotes when similarity is present and above threshold", () => {
    expect(
      applySemanticThresholds(
        {
          sourceConcept: "A",
          targetConcept: "B",
          modelId: "m",
          similarity: 0.92,
          decision: "equivalent",
        },
        DEFAULT_SEMANTIC_THRESHOLDS,
      ),
    ).toEqual({ status: "met", rawScore: 80 });
  });
});

describe("evaluationMode — versioned thresholds change outcomes", () => {
  const jobBase = {
    title: "Backend Engineer",
    description: "Build APIs",
    requirements: "Python required.",
    experienceLevel: "mid",
    education: null,
    keywords: ["Python", "Kubernetes", "GraphQL", "Redis"],
  };
  const resume = `Sam
sam@example.com

EXPERIENCE
Backend — Acme (2021 - 2024)
• Built Python services and Redis caches.
`;

  it("records mode + thresholds on snapshot configuration", () => {
    const res = evaluateCandidateWithRules({
      job: { ...jobBase, evaluationMode: "strict" },
      candidate: { resumeText: resume, answers: [] },
      referenceDate: REF,
    });
    expect(res.metadata.configuration.evaluationMode).toBe("strict");
    expect(res.metadata.configuration.modeTableVersion).toBeTruthy();
    expect(res.metadata.configuration.preferredWeightFactor).toBe(
      thresholdsForMode("strict").preferredWeightFactor,
    );
  });

  it("produces different coverage-adjusted scores across modes for the same inputs", () => {
    const mk = (mode: "relaxed" | "balanced" | "strict") =>
      evaluateCandidateWithRules({
        job: { ...jobBase, evaluationMode: mode },
        candidate: { resumeText: resume, answers: [] },
        referenceDate: REF,
        evaluatedAt: "2026-09-19T12:00:00.000Z",
      });

    const relaxed = mk("relaxed");
    const balanced = mk("balanced");
    const strict = mk("strict");

    // Preferred weight / baseline differ → scores must not all be identical.
    const scores = new Set([
      relaxed.coverageAdjustedScore,
      balanced.coverageAdjustedScore,
      strict.coverageAdjustedScore,
    ]);
    expect(scores.size).toBeGreaterThan(1);

    expect(thresholdsForMode("relaxed").tierThresholds.yesMinScore).toBeLessThan(
      thresholdsForMode("strict").tierThresholds.yesMinScore,
    );
    expect(thresholdsForMode("relaxed").semantic.equivalent).toBeLessThan(
      thresholdsForMode("strict").semantic.equivalent,
    );
  });
});

describe("Scorecard — null ≠ 0", () => {
  it("keeps rawScore null on not_demonstrated and does not coerce in criterionAssessments", () => {
    const res = evaluateCandidateWithRules({
      job: {
        title: "Engineer",
        description: "",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: ["Rust", "Python"],
        evaluationMode: "balanced",
      },
      candidate: {
        resumeText: `Dev
dev@example.com

EXPERIENCE
Engineer — Co (2022 - 2024)
• Built Python services.
`,
        answers: [],
      },
      referenceDate: REF,
    });
    const rust = res.criterionAssessments.find((c) => c.label === "Rust");
    expect(rust?.status).toBe("not_demonstrated");
    expect(rust?.rawScore).toBeNull();
    const rustLegacy = res.criterionResults.find((c) => c.label === "Rust");
    expect(rustLegacy?.score).toBeNull();
    expect(rustLegacy?.extendedStatus).toBe("not_demonstrated");
  });
});
