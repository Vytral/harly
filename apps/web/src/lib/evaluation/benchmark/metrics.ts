/**
 * ATS Evaluation Bench — layer-independent metrics (Audit doc §19.3).
 */

import { parseResumeFacts } from "../ats-parser";
import { buildStructuredCriteria } from "../criteria-builder";
import { matchCriteriaAgainstFacts } from "../ats-matcher";
import { buildCandidateSkillProfiles } from "../skill-profiler";
import type { BenchmarkFixture } from "./types";
import type { CriterionStatus } from "../types";

export interface FixtureLayerReport {
  fixtureId: string;
  positionsExpected: number;
  positionsDetected: number;
  positionPrecision: number;
  positionRecall: number;
  timelineMonthsExpected: number;
  timelineMonthsActual: number;
  timelineAbsErrorMonths: number;
  educationLevelAccuracy: number;
  skillsExpected: number;
  skillsDetected: number;
  skillPrecision: number;
  skillRecall: number;
  criterionResults: Array<{
    label: string;
    expected: CriterionStatus;
    actual: CriterionStatus;
    correct: boolean;
    relevantMonthsExpected?: number;
    relevantMonthsActual?: number | null;
  }>;
  criterionAccuracy: number;
}

function precisionRecall(
  expected: string[],
  actual: string[],
): { precision: number; recall: number } {
  const exp = new Set(expected);
  const act = new Set(actual);
  const tp = [...exp].filter((e) => act.has(e)).length;
  return {
    precision: act.size === 0 ? 0 : tp / act.size,
    recall: exp.size === 0 ? 1 : tp / exp.size,
  };
}

export function evaluateFixture(
  fixture: BenchmarkFixture,
  referenceDate: string,
): FixtureLayerReport {
  const facts = parseResumeFacts(fixture.resumeText, referenceDate);
  const profiles = buildCandidateSkillProfiles(facts, { answers: fixture.answers });
  const criteria = buildStructuredCriteria({
    job: { ...fixture.job },
    candidate: { resumeText: fixture.resumeText, answers: fixture.answers ?? [] },
    referenceDate,
  });
  const results = matchCriteriaAgainstFacts(criteria, facts, { answers: fixture.answers });

  // Position match: when gold has a parseable startYear, require year + title-token
  // overlap; when gold startYear is 0 (deliberately dateless role), match on title only.
  const posTp = fixture.gold.positions.filter((gp) =>
    facts.workHistory.some((r) => {
      const titleOverlap =
        r.title.toLowerCase().includes(gp.title.split(" ")[0]!.toLowerCase()) ||
        gp.title.toLowerCase().includes(r.title.split(" ")[0]!.toLowerCase());
      return gp.startYear > 0 ? r.startYear === gp.startYear && titleOverlap : titleOverlap;
    }),
  ).length;
  const positionPrecision = facts.workHistory.length === 0 ? 0 : posTp / facts.workHistory.length;
  const positionRecall = fixture.gold.positions.length === 0 ? 1 : posTp / fixture.gold.positions.length;

  const timelineAbsErrorMonths = Math.abs(facts.totalWorkDurationMonths - fixture.gold.timelineMonths);

  // Education-level accuracy is only meaningful when the resume actually contains
  // an education entry the parser could classify. If the parser found none, score 0.
  const goldTopRank = Math.max(0, ...fixture.gold.education.map((e) => e.levelRank));
  const educationLevelAccuracy =
    fixture.gold.education.length === 0
      ? 1
      : facts.education.length === 0
        ? 0
        : facts.highestEducation && facts.highestEducation.levelRank === goldTopRank
          ? 1
          : 0;

  const expectedSkillIds = fixture.gold.skills.map((s) => s.conceptId);
  const actualSkillIds = profiles.profiles.map((p) => p.conceptId!);
  const skillPR = precisionRecall(expectedSkillIds, actualSkillIds);

  const criterionResults = fixture.gold.criterionExpectations.map((exp) => {
    const actual = results.find((r) => r.label === exp.label);
    let relevantMonthsActual: number | null | undefined;
    if (exp.expectedRelevantMonths !== undefined && exp.type === "skill") {
      const crit = criteria.find((c) => c.label === exp.label);
      if (crit?.conceptId) {
        const profile = profiles.profiles.find((p) => p.conceptId === crit.conceptId);
        relevantMonthsActual = profile?.relevantDuration.exactMonths
          ?? profile?.relevantDuration.upperBoundMonths
          ?? null;
      }
    }
    return {
      label: exp.label,
      expected: exp.expectedStatus,
      actual: actual?.status ?? ("unknown" as CriterionStatus),
      correct: actual?.status === exp.expectedStatus,
      relevantMonthsExpected: exp.expectedRelevantMonths,
      relevantMonthsActual,
    };
  });
  const criterionAccuracy =
    criterionResults.length === 0
      ? 1
      : criterionResults.filter((c) => c.correct).length / criterionResults.length;

  return {
    fixtureId: fixture.id,
    positionsExpected: fixture.gold.positions.length,
    positionsDetected: facts.workHistory.length,
    positionPrecision,
    positionRecall,
    timelineMonthsExpected: fixture.gold.timelineMonths,
    timelineMonthsActual: facts.totalWorkDurationMonths,
    timelineAbsErrorMonths,
    educationLevelAccuracy,
    skillsExpected: expectedSkillIds.length,
    skillsDetected: actualSkillIds.length,
    skillPrecision: skillPR.precision,
    skillRecall: skillPR.recall,
    criterionResults,
    criterionAccuracy,
  };
}

export interface CorpusAggregateReport {
  fixtureCount: number;
  avgPositionPrecision: number;
  avgPositionRecall: number;
  avgTimelineAbsErrorMonths: number;
  avgEducationLevelAccuracy: number;
  avgSkillPrecision: number;
  avgSkillRecall: number;
  avgCriterionAccuracy: number;
  reports: FixtureLayerReport[];
}

export function aggregateReports(reports: FixtureLayerReport[]): CorpusAggregateReport {
  const n = reports.length || 1;
  const avg = (f: (r: FixtureLayerReport) => number) =>
    reports.reduce((s, r) => s + f(r), 0) / n;
  return {
    fixtureCount: reports.length,
    avgPositionPrecision: avg((r) => r.positionPrecision),
    avgPositionRecall: avg((r) => r.positionRecall),
    avgTimelineAbsErrorMonths: avg((r) => r.timelineAbsErrorMonths),
    avgEducationLevelAccuracy: avg((r) => r.educationLevelAccuracy),
    avgSkillPrecision: avg((r) => r.skillPrecision),
    avgSkillRecall: avg((r) => r.skillRecall),
    avgCriterionAccuracy: avg((r) => r.criterionAccuracy),
    reports,
  };
}
