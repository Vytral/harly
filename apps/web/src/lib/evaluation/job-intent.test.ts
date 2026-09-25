import { describe, expect, it } from "vitest";

import {
  applyRecruiterDecision,
  buildGovernedCriteriaFromJobDescription,
  extractRequirementCandidates,
  toApprovedRubric,
  toRubricCriterion,
  toSuggestedCriterion,
} from "./job-intent";
import { buildStructuredCriteria } from "./criteria-builder";
import { evaluateCandidateWithRules } from "./rules";

describe("Phase 2 — Job Intelligence: requirement extraction (§9)", () => {
  const jd = `Senior Backend Engineer

We are looking for a Senior Backend Engineer to own payment services.

Requirements:
- 5+ years experience in Python required
- Strong PostgreSQL skills
- Kubernetes experience is a plus
- Bachelor's degree required
- 2+ years experience preferred
`;

  it("extracts skill tenure constraints with provenance", () => {
    const cands = extractRequirementCandidates(jd);
    const python = cands.find((c) => c.conceptId === "skill:python");
    expect(python).toBeDefined();
    expect(python!.minimumMonths).toBe(60);
    expect(python!.requiredSignal).toBe(true);
    expect(python!.type).toBe("skill");
    expect(python!.provenance.rawText).toContain("5+ years experience in Python");
    expect(python!.provenance.lineIndex).toBeGreaterThanOrEqual(0);
  });

  it("extracts education floor with rank", () => {
    const cands = extractRequirementCandidates(jd);
    const edu = cands.find((c) => c.type === "education");
    expect(edu).toBeDefined();
    expect(edu!.minimumEducationLevelRank).toBe(3);
    expect(edu!.requiredSignal).toBe(true);
  });

  it("extracts skill mentions and dedupes concepts across lines", () => {
    const cands = extractRequirementCandidates(jd);
    const ids = cands.map((c) => c.conceptId).filter(Boolean);
    expect(ids).toContain("skill:postgresql");
    expect(ids).toContain("skill:kubernetes");
    // Deduped — one entry per concept.
    expect(ids.filter((i) => i === "skill:postgresql").length).toBe(1);
  });

  it("extracts standalone experience-duration requirement", () => {
    const cands = extractRequirementCandidates(jd);
    const exp = cands.find((c) => c.type === "experience_duration");
    expect(exp).toBeDefined();
    expect(exp!.minimumMonths).toBe(24);
  });

  it("returns empty for empty/whitespace JD (no fabrication)", () => {
    expect(extractRequirementCandidates("")).toEqual([]);
    expect(extractRequirementCandidates("   \n  \n")).toEqual([]);
  });
});

describe("Phase 2 — Governance: no silent knockouts / exclusions (§2.3, §3.4, exit gate)", () => {
  const jd = "5+ years Python required. Kubernetes required.";

  it("extracted candidates always start suggested + preferred + non-knockout", () => {
    const cands = extractRequirementCandidates(jd);
    for (const c of cands) {
      const g = toSuggestedCriterion(c);
      expect(g.approval).toBe("suggested");
      expect(g.importance).toBe("preferred"); // never auto-required from text
      expect(g.isKnockout).toBe(false);       // NEVER silent knockout
      expect(g.constraint).toBe("match");     // never auto-excluded
    }
  });

  it("rejected criteria are excluded from the authoritative rubric", () => {
    const cands = extractRequirementCandidates(jd);
    const rejected = applyRecruiterDecision(cands[0]!, { approve: false });
    expect(rejected.approval).toBe("rejected");
    expect(toRubricCriterion(rejected)).toBeNull();
    const suggested = toSuggestedCriterion(cands[0]!);
    expect(toRubricCriterion(suggested)).toBeNull();
  });

  it("approved criteria enter rubric; recruiter controls importance/knockout", () => {
    const cands = extractRequirementCandidates(jd);
    const python = cands.find((c) => c.conceptId === "skill:python")!;
    const approved = applyRecruiterDecision(python, {
      approve: true,
      importance: "required",
      isKnockout: true,
    });
    expect(approved.approval).toBe("approved");
    expect(approved.importance).toBe("required");
    expect(approved.isKnockout).toBe(true);
    expect(approved.origin).toBe("recruiter_rubric");
    const rubric = toRubricCriterion(approved);
    expect(rubric).not.toBeNull();
    expect(rubric!.isKnockout).toBe(true);
    expect(rubric!.excluded).toBe(false);
    expect(rubric!.sourceProvenance?.sourceType).toBe("job_description");
    expect(rubric!.sourceProvenance?.rawText).toContain("Python");
  });

  it("knockout is ignored unless importance=required", () => {
    const cands = extractRequirementCandidates(jd);
    const k8s = cands.find((c) => c.conceptId === "skill:kubernetes")!;
    const bad = applyRecruiterDecision(k8s, {
      approve: true,
      importance: "preferred",
      isKnockout: true, // attempt knockout on preferred — must be refused
    });
    expect(bad.importance).toBe("preferred");
    expect(bad.isKnockout).toBe(false); // governance refuses
  });

  it("excluded constraint forces required + knockout semantics, recruiter-only", () => {
    const cands = extractRequirementCandidates(jd);
    const python = cands.find((c) => c.conceptId === "skill:python")!;
    const excluded = applyRecruiterDecision(python, {
      approve: true,
      constraint: "excluded",
    });
    expect(excluded.constraint).toBe("excluded");
    expect(excluded.importance).toBe("required"); // forced
    const rubric = toRubricCriterion(excluded);
    expect(rubric!.excluded).toBe(true);
    expect(rubric!.importance).toBe("required");
  });

  it("buildGovernedCriteriaFromJobDescription keeps unreviewed as suggested", () => {
    const governed = buildGovernedCriteriaFromJobDescription(jd);
    expect(governed.length).toBeGreaterThan(0);
    expect(governed.every((g) => g.approval === "suggested")).toBe(true);
    expect(governed.every((g) => !g.isKnockout)).toBe(true);
  });

  it("applies decisions map by id", () => {
    const governed = buildGovernedCriteriaFromJobDescription(jd, {
      "jd:skill-tenure:python": { approve: true, importance: "required" },
    });
    const python = governed.find((g) => g.conceptId === "skill:python")!;
    expect(python.approval).toBe("approved");
    expect(python.importance).toBe("required");
    // Others remain suggested.
    expect(governed.filter((g) => g.approval === "suggested").length).toBeGreaterThan(0);
  });
});

describe("Phase 2 — Integration: excluded criterion disqualifies via builder (§3.4)", () => {
  it("excluded rubric criterion forces isKnockout + required in StructuredCriterion", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "X", description: "", requirements: null,
        experienceLevel: null, education: null, keywords: [],
      },
      candidate: { resumeText: "", answers: [] },
      rubric: {
        version: "test",
        criteria: [
          {
            key: "crit:no-php", label: "PHP", type: "skill",
            importance: "preferred", weight: 50, aliases: [],
            excluded: true,
          },
        ],
      },
    });
    expect(criteria[0]!.excluded).toBe(true);
    expect(criteria[0]!.isKnockout).toBe(true);   // forced
    expect(criteria[0]!.importance).toBe("required"); // forced
  });

  it("non-excluded structured fields never auto-create knockout (§27)", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Backend", description: "", requirements: "5+ years Python required",
        experienceLevel: "Senior (5+ years)", education: "Bachelor's", keywords: ["Python"],
      },
      candidate: { resumeText: "", answers: [] },
    });
    for (const c of criteria) {
      expect(c.isKnockout).toBe(false);
      expect(c.excluded).toBeFalsy();
    }
  });

  it("does not score unapproved free-text job requirements", () => {
    const criteria = buildStructuredCriteria({
      job: {
        title: "Backend Engineer",
        description: "Must have Kubernetes and Terraform.",
        requirements: "Kubernetes required. Terraform required.",
        experienceLevel: null,
        education: null,
        keywords: ["Python"],
      },
      candidate: { resumeText: null, answers: [] },
    });

    expect(criteria.map((criterion) => criterion.label)).toEqual(["Python", "Backend Engineer"]);
    expect(criteria.some((criterion) => criterion.origin === "job_description")).toBe(false);
  });
});

describe("Phase 2 — End-to-end: governed exclusion drives disqualification", () => {
  it("a failed excluded criterion forces requiresHumanReview + knockout gate (§3.4)", async () => {
    const { evaluateCandidateWithRules } = await import("./rules");
    // Candidate has PHP, but PHP is an excluded skill for this role.
    const result = evaluateCandidateWithRules({
      job: {
        title: "Python Engineer", description: "", requirements: null,
        experienceLevel: null, education: null, keywords: ["Python"],
      },
      candidate: {
        resumeText: `Dev
Engineer

EXPERIENCE
Engineer — X (2022-Present)
• Built services in Python and PHP.
`,
        answers: [],
      },
      rubric: {
        version: "test",
        criteria: [
          { key: "crit:python", label: "Python", type: "skill", importance: "required", weight: 50, aliases: [] },
          { key: "crit:no-php", label: "PHP", type: "skill", importance: "required", weight: 50, aliases: [], excluded: true },
        ],
      },
      referenceDate: "2026-09-19",
    });
    const php = result.criterionResults.find((c) => c.label === "PHP")!;
    // Excluded + evidence present -> knockout gate trips.
    expect(php.isKnockout).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });
});

describe("Phase 2 — §27 criteria behavior: knockout pass/fail + §16.5 safeguards", () => {
  it("knockout pass: candidate satisfying the knockout criterion is NOT gated", async () => {
    const { evaluateCandidateWithRules } = await import("./rules");
    const result = evaluateCandidateWithRules({
      job: { title: "Backend", description: "", requirements: null, experienceLevel: null, education: null, keywords: [] },
      candidate: {
        resumeText: `Dev
Engineer

EXPERIENCE
Engineer — X (2022-Present)
• Built services in Python.
`,
        answers: [],
      },
      rubric: {
        version: "t",
        criteria: [
          { key: "crit:python", label: "Python", type: "skill", importance: "required", weight: 50, aliases: [], isKnockout: true },
        ],
      },
      referenceDate: "2026-09-19",
    });
    const py = result.criterionResults.find((c) => c.label === "Python")!;
    expect(py.isKnockout).toBe(true);
    expect(py.extendedStatus).toBe("met");
    expect(result.result.recommendation).not.toBe("no");
  });

  it("knockout fail: candidate missing the knockout criterion is gated to 'no'", async () => {
    const { evaluateCandidateWithRules } = await import("./rules");
    const result = evaluateCandidateWithRules({
      job: { title: "Backend", description: "", requirements: null, experienceLevel: null, education: null, keywords: [] },
      candidate: {
        resumeText: `Dev
Engineer

EXPERIENCE
Engineer — X (2022-Present)
• Built services in Ruby.
`,
        answers: [],
      },
      rubric: {
        version: "t",
        criteria: [
          { key: "crit:python", label: "Python", type: "skill", importance: "required", weight: 50, aliases: [], isKnockout: true },
        ],
      },
      referenceDate: "2026-09-19",
    });
    expect(result.result.recommendation).toBe("no");
    expect(result.requiresHumanReview).toBe(true);
  });

  it("§16.5: flags inappropriate/bias-prone criteria for recruiter clarification", async () => {
    const { flagInappropriateCandidates, extractRequirementCandidates } = await import("./job-intent");
    const cands = extractRequirementCandidates("Looking for a young, energetic rockstar who is a culture fit. Must have 3+ years Python.");
    const warnings = flagInappropriateCandidates(cands);
    // Python skill itself is fine; the personality/age terms must be flagged on their lines.
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /culture fit|young|energetic|rockstar|discriminatory|not job-relevant|not measurable/i.test(w.reason))).toBe(true);
  });

  it("recruiter aliases are honored end-to-end (§27)", async () => {
    const { evaluateCandidateWithRules } = await import("./rules");
    const result = evaluateCandidateWithRules({
      job: { title: "Backend", description: "", requirements: null, experienceLevel: null, education: null, keywords: [] },
      candidate: {
        resumeText: `Dev
Engineer

EXPERIENCE
Engineer — X (2022-Present)
• Operated K8s clusters in production.
`,
        answers: [],
      },
      rubric: {
        version: "t",
        criteria: [
          { key: "crit:k8s", label: "Kubernetes", type: "skill", importance: "required", weight: 50, aliases: ["K8s"] },
        ],
      },
      referenceDate: "2026-09-19",
    });
    const k8s = result.criterionResults.find((c) => c.label === "Kubernetes")!;
    expect(k8s.extendedStatus).toBe("met");
    expect(k8s.matchMethod).toBe("recruiter_alias");
  });
});

describe("Phase 2 — approval-to-rubric adapter (exit gate)", () => {
  const jd = `Backend Engineer needed.

Requirements:
- Python required
- Docker experience preferred
`;

  it("only approved criteria enter the published rubric, with recruiter gates", () => {
    const governed = buildGovernedCriteriaFromJobDescription(jd, {
      "jd:skill:python": { approve: true, importance: "required", isKnockout: true },
      "jd:skill:docker": { approve: false },
    });
    const rubric = toApprovedRubric("job-rubric-v1", governed);
    expect(rubric.version).toBe("job-rubric-v1");
    expect(rubric.criteria.map((c) => c.label)).toEqual(["Python"]);
    expect(rubric.criteria[0]).toMatchObject({
      importance: "required",
      isKnockout: true,
      excluded: false,
    });
  });

  it("an approved knockout gates end-to-end when the candidate lacks it", () => {
    const governed = buildGovernedCriteriaFromJobDescription(jd, {
      "jd:skill:python": { approve: true, importance: "required", isKnockout: true },
      "jd:skill:docker": { approve: true, importance: "preferred" },
    });
    const rubric = toApprovedRubric("job-rubric-v1", governed);
    const res = evaluateCandidateWithRules({
      job: {
        title: "Backend Engineer",
        description: "Backend",
        requirements: null,
        experienceLevel: null,
        education: null,
        keywords: [],
      },
      candidate: {
        resumeText: `Op Dev
op@example.com

EXPERIENCE
Backend Developer — Acme (2021 - 2024)
• Shipped containers with Docker.
`,
        answers: [],
      },
      rubric,
      referenceDate: "2024-06-01",
    });
    // Python (approved knockout) is missing -> gate fails -> No.
    expect(res.result.recommendation).toBe("no");
    expect(res.requiresHumanReview).toBe(true);
    // Docker (approved preferred) is demonstrated.
    expect(res.criterionResults.find((c) => c.label === "Docker")?.extendedStatus).toBe("met");
  });
});
