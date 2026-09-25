import { describe, expect, it } from "vitest";

import { parseResumeFacts } from "./ats-parser";
import {
  buildCandidateSkillProfiles,
  computeRelevantDuration,
  extractSkillEvidenceOccurrences,
  relevantDurationForConcept,
} from "./skill-profiler";
import {
  isRelatedButNotEquivalent,
  matchSkillConceptsInText,
  resolveSkillConcept,
  tokenizeSkillText,
} from "./taxonomy/skill-concepts";
import type { SkillEvidenceOccurrence } from "./types";

const REFERENCE_DATE = "2026-09-19";

function makeOccurrence(
  overrides: Partial<SkillEvidenceOccurrence> & Pick<SkillEvidenceOccurrence, "rawTerm" | "evidenceKind">,
): SkillEvidenceOccurrence {
  return {
    normalizationMethod: "exact",
    provenance: { sourceType: "resume", section: "experience", rawText: overrides.rawTerm },
    ...overrides,
  };
}

describe("Phase 1 — Skill canonicalization (§27)", () => {
  it("preserves technical symbols: C++, C#, .NET, Node.js", () => {
    expect(tokenizeSkillText("Built services in C++ and C#")).toEqual(
      expect.arrayContaining(["C++", "C#"]),
    );
    expect(tokenizeSkillText(".NET Core APIs")).toContain(".NET");
    expect(tokenizeSkillText("Node.js backends")).toContain("Node.js");
  });

  it("canonicalizes aliases: React.js → React, JS → JavaScript, Postgres → PostgreSQL", () => {
    expect(resolveSkillConcept("React.js").canonicalName).toBe("React");
    expect(resolveSkillConcept("JS").canonicalName).toBe("JavaScript");
    expect(resolveSkillConcept("Postgres").canonicalName).toBe("PostgreSQL");
  });

  it("resolves acronym expansion (TS → TypeScript)", () => {
    const resolved = resolveSkillConcept("TS");
    expect(resolved.conceptId).toBe("skill:typescript");
    expect(resolved.method).toBe("built_in_alias");
  });

  it("honors recruiter-provided aliases", () => {
    const resolved = resolveSkillConcept("InternalCRM", ["CRM"]);
    expect(resolved.method).toBe("recruiter_alias");
    expect(resolved.searchTokens).toContain("CRM");
  });

  it("keeps related-but-not-equivalent skills distinct (React ≠ JavaScript)", () => {
    expect(isRelatedButNotEquivalent("JavaScript", "React")).toBe(false);
    // React lists Next.js/React Native as related; those must not match a React criterion.
    expect(isRelatedButNotEquivalent("React", "Next.js")).toBe(true);
    const react = resolveSkillConcept("React");
    const next = resolveSkillConcept("Next.js");
    expect(react.conceptId).not.toBe(next.conceptId);
  });

  it("leaves unknown skills unresolved rather than guessing", () => {
    const resolved = resolveSkillConcept("COBOL");
    expect(resolved.conceptId).toBeUndefined();
    expect(resolved.canonicalName).toBe("COBOL");
  });

  it("finds multiple concepts inside free text", () => {
    const found = matchSkillConceptsInText("Built APIs with Node.js, React and PostgreSQL");
    const ids = found.map((f) => f.conceptId);
    expect(ids).toEqual(
      expect.arrayContaining(["skill:nodejs", "skill:react", "skill:postgresql"]),
    );
  });
});

describe("Phase 1 — Skill evidence occurrences (§27 evidence strength)", () => {
  const resume = `Jane Dev
Senior Engineer

EXPERIENCE
Platform Engineer — Nimbus (2023-Present)
• Operated Kubernetes clusters on AWS.

Backend Engineer — Mosaic (2020-2023)
• Built services in Python and PostgreSQL.

SKILLS
• Kubernetes
• Python
• MadeUpFramework

CERTIFICATIONS
• AWS Certified Solutions Architect
`;

  it("distinguishes declared vs demonstrated vs credentialed evidence", () => {
    const facts = parseResumeFacts(resume, REFERENCE_DATE);
    const occurrences = extractSkillEvidenceOccurrences(facts);

    const k8s = occurrences.filter((o) => o.conceptId === "skill:kubernetes");
    expect(k8s.some((o) => o.evidenceKind === "demonstrated_role")).toBe(true);
    expect(k8s.some((o) => o.evidenceKind === "declared")).toBe(true);

    const aws = occurrences.filter((o) => o.conceptId === "skill:aws");
    expect(aws.some((o) => o.evidenceKind === "credentialed")).toBe(true);
  });

  it("records unresolved declared terms instead of dropping them", () => {
    const facts = parseResumeFacts(resume, REFERENCE_DATE);
    const doc = buildCandidateSkillProfiles(facts);
    expect(doc.unresolvedDeclaredTerms).toContain("MadeUpFramework");
  });

  it("extracts application-answer evidence when provided", () => {
    const facts = parseResumeFacts("Jane Dev\nEngineer\n", REFERENCE_DATE);
    const occurrences = extractSkillEvidenceOccurrences(facts, {
      answers: [{ question: "Tech stack?", answer: "Mostly React and TypeScript" }],
    });
    expect(
      occurrences.some(
        (o) => o.evidenceKind === "application_answer" && o.conceptId === "skill:react",
      ),
    ).toBe(true);
  });
});

describe("Phase 1 — Relevant duration (§27 relevant duration)", () => {
  it("prefers an explicit skill-tenure claim over a role-span estimate", () => {
    const occurrences = [
      makeOccurrence({
        rawTerm: "I have 5 years of Python experience",
        evidenceKind: "demonstrated_role",
        roleId: "role:1",
        interval: { startYear: 2023, endYear: 2026, isCurrent: true, bounded: true },
        explicitDurationMonths: 60,
      }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    expect(result.exactMonths).toBe(60);
    expect(result.upperBoundMonths).toBe(60);
    expect(result.method).toBe("explicit_duration_text");
  });

  it("extracts an explicit duration from a declared skill without inventing a role", () => {
    const facts = parseResumeFacts(`Dev
Engineer

SKILLS
• 5 years of Python
`, REFERENCE_DATE);
    const profile = relevantDurationForConcept(
      buildCandidateSkillProfiles(facts),
      "skill:python",
    );
    expect(profile?.exactMonths).toBe(60);
    expect(profile?.method).toBe("explicit_duration_text");
    expect(profile?.sourceRoleIds).toEqual([]);
  });

  it("keeps a bounded role window separate from exact skill duration", () => {
    const occurrences = [
      makeOccurrence({
        rawTerm: "React",
        evidenceKind: "demonstrated_role",
        roleId: "role:1",
        interval: { startYear: 2023, startMonth: 1, endYear: 2026, endMonth: 9, isCurrent: true, bounded: true },
      }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    expect(result.exactMonths).toBeNull();
    expect(result.lowerBoundMonths).toBe(0);
    expect(result.upperBoundMonths).toBe((2026 - 2023) * 12 + (9 - 1));
    expect(result.method).toBe("bounded_interval_union");
    expect(result.isCurrentEvidence).toBe(true);
    expect(result.lastUsedMonthsAgo).toBe(0);
    expect(result.lastEvidenceDate).toBe(REFERENCE_DATE);
    expect(result.sourceRoleIds).toEqual(["role:1"]);
  });

  it("unions non-overlapping roles without double counting", () => {
    const occurrences = [
      makeOccurrence({
        rawTerm: "Python",
        evidenceKind: "demonstrated_role",
        roleId: "role:1",
        interval: { startYear: 2018, endYear: 2020, isCurrent: false, bounded: true },
      }),
      makeOccurrence({
        rawTerm: "Python",
        evidenceKind: "demonstrated_role",
        roleId: "role:2",
        interval: { startYear: 2021, endYear: 2023, isCurrent: false, bounded: true },
      }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    expect(result.exactMonths).toBeNull();
    expect(result.lowerBoundMonths).toBe(0);
    expect(result.upperBoundMonths).toBe(48); // 24 + 24
    expect(result.isCurrentEvidence).toBe(false);
    expect(result.lastUsedMonthsAgo).toBe((2026 - 2023) * 12 + 9); // ~45 months
  });

  it("never double counts overlapping roles (property invariant)", () => {
    const occurrences = [
      makeOccurrence({
        rawTerm: "Kubernetes",
        evidenceKind: "demonstrated_role",
        roleId: "role:1",
        interval: { startYear: 2022, endYear: 2025, isCurrent: false, bounded: true },
      }),
      makeOccurrence({
        rawTerm: "Kubernetes",
        evidenceKind: "demonstrated_role",
        roleId: "role:2",
        interval: { startYear: 2023, endYear: 2026, isCurrent: false, bounded: true },
      }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    // Union 2022→2026 = 48 months, not 36 + 36 = 72
    expect(result.exactMonths).toBeNull();
    expect(result.upperBoundMonths).toBeLessThanOrEqual(48);
  });

  it("marks skill-specific experience as distinct from total career experience", () => {
    const resume = `Dev
Engineer

EXPERIENCE
Backend Engineer — A (2020-Present)
• Built Python services.

QA Analyst — B (2015-2020)
• Manual testing and bug triage.
`;
    const facts = parseResumeFacts(resume, REFERENCE_DATE);
    const doc = buildCandidateSkillProfiles(facts);
    const python = relevantDurationForConcept(doc, "skill:python");

    // Total career = 2015→2026 (~11.7 yrs) but Python only in the 2020+ role.
    expect(facts.totalWorkDurationMonths).toBeGreaterThan(100);
    expect(python).not.toBeNull();
    expect(python!.sourceRoleIds).toEqual(["role:1"]);
    expect(python!.exactMonths).toBeNull();
    expect(python!.upperBoundMonths).toBeLessThanOrEqual((2026 - 2020) * 12 + 9);
    expect(python!.upperBoundMonths).toBeGreaterThan(0);
    expect(python!.isCurrentEvidence).toBe(true);
  });

  it("does not count negated mentions ('no Python') as positive skill evidence", () => {
    const resume = `Dev
Engineer

EXPERIENCE
QA Analyst — B (2015-2020)
• Manual testing, no Python required.
`;
    const facts = parseResumeFacts(resume, REFERENCE_DATE);
    const doc = buildCandidateSkillProfiles(facts);
    const python = relevantDurationForConcept(doc, "skill:python");
    // Negated mentions must not contribute role tenure to the skill.
    expect(python).toBeNull();
  });

  it("returns no duration when evidence is only declared (no false precision)", () => {
    const occurrences = [
      makeOccurrence({ rawTerm: "React", evidenceKind: "declared" }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    expect(result.exactMonths).toBeNull();
    expect(result.lowerBoundMonths).toBe(0);
    expect(result.method).toBe("none");
    expect(result.isCurrentEvidence).toBe(false);
  });

  it("flags stale skill usage via lastUsedMonthsAgo", () => {
    const occurrences = [
      makeOccurrence({
        rawTerm: "Angular",
        evidenceKind: "demonstrated_role",
        roleId: "role:1",
        interval: { startYear: 2016, endYear: 2018, isCurrent: false, bounded: true },
      }),
    ];
    const result = computeRelevantDuration(occurrences, REFERENCE_DATE);
    expect(result.isCurrentEvidence).toBe(false);
    expect(result.lastUsedMonthsAgo).toBeGreaterThan(60); // > 5 years stale
  });
});
