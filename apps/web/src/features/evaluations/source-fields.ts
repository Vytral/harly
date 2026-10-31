import type { CandidateScore } from "@/lib/ai/schemas";
import type { RulesEvaluation } from "@/lib/evaluation/rules";

/**
 * The quality fields that depend on who produced the score. The rules engine
 * always runs (it supplies facts, rubric and impact snapshots), but an AI
 * evaluation must not carry the rules engine's criteria, coverage or review
 * flag: the card would show rules rows and "Evidence 0%" under an AI score.
 * For AI, coverage is the share of the AI's own criteria backed by a quote.
 */
export function sourceScopedEvaluationFields(
  source: "ai" | "rules",
  rules: RulesEvaluation,
  result: CandidateScore,
) {
  if (source === "rules") {
    return {
      criterionResults: rules.criterionResults,
      criterionDetailsSnapshot: rules.criterionAssessments,
      evidenceCoverage: rules.evidenceCoverage,
      confidence: rules.confidence,
      requiresHumanReview: rules.requiresHumanReview,
    };
  }
  const criteria = result.criteria;
  const backed = criteria.filter((criterion) => criterion.evidence?.trim()).length;
  return {
    criterionResults: undefined,
    criterionDetailsSnapshot: null,
    evidenceCoverage: criteria.length > 0 ? Math.round((backed / criteria.length) * 100) : 0,
    confidence: null,
    requiresHumanReview: false,
  };
}
