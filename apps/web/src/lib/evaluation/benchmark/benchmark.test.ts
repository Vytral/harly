import { describe, expect, it } from "vitest";

import { evaluateCandidateWithRules } from "../rules";
import { fromPlainText } from "../parsing/document";
import { BENCHMARK_CORPUS, BENCHMARK_REFERENCE_DATE, LAYOUT_CORPUS } from "./corpus";
import { aggregateReports, evaluateFixture } from "./metrics";

describe("ATS Evaluation Bench (§19)", () => {
  const reports = BENCHMARK_CORPUS.map((f) => evaluateFixture(f, BENCHMARK_REFERENCE_DATE));
  const agg = aggregateReports(reports);

  it("uses a curated corpus in the audit's minimum recommended range", () => {
    expect(BENCHMARK_CORPUS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(BENCHMARK_CORPUS.flatMap((fixture) => fixture.tags.filter((tag) => tag.startsWith("role:")))).size).toBeGreaterThanOrEqual(8);
  });

  it("parser: position extraction precision/recall ≥ 0.9", () => {
    expect(agg.avgPositionPrecision).toBeGreaterThanOrEqual(0.9);
    expect(agg.avgPositionRecall).toBeGreaterThanOrEqual(0.9);
  });

  it("parser: timeline absolute error ≤ 3 months on average", () => {
    expect(agg.avgTimelineAbsErrorMonths).toBeLessThanOrEqual(3);
  });

  it("parser: education level accuracy = 1.0 on dated fixtures", () => {
    expect(agg.avgEducationLevelAccuracy).toBe(1);
  });

  it("canonicalization: skill recall = 1.0 (no gold skill lost)", () => {
    expect(agg.avgSkillRecall).toBe(1);
  });

  it("matcher: criterion status accuracy = 1.0 against gold labels", () => {
    const mismatches = reports.flatMap((r) =>
      r.criterionResults.filter((c) => !c.correct).map((c) => `${r.fixtureId}:${c.label} expected=${c.expected} actual=${c.actual}`),
    );
    expect(mismatches).toEqual([]);
    expect(agg.avgCriterionAccuracy).toBe(1);
  });

  it("matcher: relevant duration for criterion-specific skill matches gold (DevOps overlap case)", () => {
    const devops = reports.find((r) => r.fixtureId === "devops-overlapping-roles")!;
    const k8s = devops.criterionResults.find((c) => c.label === "Kubernetes")!;
    expect(k8s.relevantMonthsActual).toBe(60);
  });

  it("golden snapshot: Isabella-like fixture reproduces Strong Yes deterministically", () => {
    const isabella = reports.find((r) => r.fixtureId === "growth-marketing-manager")!;
    expect(isabella.criterionAccuracy).toBe(1);
    expect(isabella.timelineMonthsActual).toBe(96);
  });
});

describe("Layout robustness — graceful degradation, never fabrication (§6, §19.1)", () => {
  const REF = BENCHMARK_REFERENCE_DATE;

  function evaluateLayout(id: string) {
    const fixture = LAYOUT_CORPUS.find((f) => f.id === id)!;
    return evaluateCandidateWithRules({
      job: { ...fixture.job },
      candidate: { resumeText: fixture.resumeText, answers: [] },
      referenceDate: REF,
      evaluatedAt: `${REF}T12:00:00.000Z`,
    });
  }

  it("two-column interleaved dump: no phantom roles, explicit review escalation", () => {
    const res = evaluateLayout("layout-two-column-interleaved");
    // No role headers survive the interleave -> zero parsed positions, zero fabricated tenure.
    expect(res.candidateFacts.workHistory).toEqual([]);
    expect(res.candidateFacts.totalWorkDurationMonths).toBe(0);
    const experience = res.criterionResults.find((c) => c.label === "Experience")!;
    expect(experience.extendedStatus).toBe("unknown");
    // Nothing scored without evidence; coverage collapses; a human must look.
    expect(res.criterionResults.every((c) => c.score === null || c.evidence !== null)).toBe(true);
    expect(res.requiresHumanReview).toBe(true);
  });

  it("identical content in reading order parses fully (control proves layout causation)", () => {
    const res = evaluateLayout("layout-two-column-control");
    expect(res.candidateFacts.workHistory.length).toBe(1);
    expect(res.criterionResults.find((c) => c.label === "Python")?.extendedStatus).toBe("met");
    expect(res.criterionResults.find((c) => c.label === "Experience")?.extendedStatus).toBe("met");
    expect(res.result.recommendation).toBe("strong_yes");
    expect(res.requiresHumanReview).toBe(false);
  });

  it("unreadable scan yields unknown across the board, never positive evidence", () => {
    const res = evaluateLayout("layout-scanned-empty");
    expect(res.candidateFacts.workHistory).toEqual([]);
    for (const criterion of res.criterionResults) {
      expect(["not_demonstrated", "unknown"]).toContain(criterion.extendedStatus);
      expect(criterion.score).toBeNull();
    }
    expect(res.evidenceCoverage).toBe(0);
    expect(res.requiresHumanReview).toBe(true);
  });

  it("document path carries block provenance into criterion evidence", () => {
    const fixture = LAYOUT_CORPUS.find((f) => f.id === "layout-two-column-control")!;
    const res = evaluateCandidateWithRules({
      job: { ...fixture.job },
      candidate: { resumeText: fixture.resumeText, answers: [] },
      referenceDate: REF,
      sourceDocument: fromPlainText({ text: fixture.resumeText }),
    });
    const python = res.criterionResults.find((c) => c.label === "Python")!;
    expect(python.extendedStatus).toBe("met");
    expect(res.candidateFacts.extractionMethod).toBe("text_layer");
  });
});
