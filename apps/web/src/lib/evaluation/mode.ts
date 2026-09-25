/**
 * Evaluation mode thresholds (relaxed / balanced / strict).
 *
 * The motor MUST read `evaluationMode` and apply this versioned table for
 * coverage shrinkage, preferred weight, knockout softness, semantic thresholds,
 * and recommendation tiers. Snapshot metadata records the active mode + values.
 */

import type { SemanticAssistThresholds } from "./matching/semantic-assist";

export const EVALUATION_MODES = ["relaxed", "balanced", "strict"] as const;

export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const DEFAULT_EVALUATION_MODE: EvaluationMode = "balanced";

/** Version of the mode threshold table — bump when any mode value changes. */
export const EVALUATION_MODE_TABLE_VERSION = "mode-thresholds-v1";

export type EvaluationModeThresholds = {
  mode: EvaluationMode;
  tableVersion: string;
  /** Neutral baseline used when coverage shrinks toward unverified evidence. */
  unverifiedEvidenceBaseline: number;
  requiredWeightFactor: number;
  preferredWeightFactor: number;
  /**
   * soft: knockout not_demonstrated / unknown does not force recommendation "no"
   *       (still requires human review). Hard knockout failures (not_met) still gate.
   * hard: any knockoutFailed forces "no" (balanced/strict).
   */
  knockoutSoftness: "soft" | "hard";
  /** Max required unverified criteria allowed for "yes" / "strong_yes". */
  yesMaxRequiredUnverified: number;
  strongYesMaxRequiredUnverified: number;
  /** Coverage floor that triggers human review. */
  humanReviewCoverageFloor: number;
  semantic: SemanticAssistThresholds;
  tierThresholds: {
    strongYesMinScore: number;
    strongYesMinCoverage: number;
    strongYesMinConfidence: number;
    yesMinScore: number;
    yesMinCoverage: number;
    maybeMinScore: number;
  };
};

const BALANCED: EvaluationModeThresholds = {
  mode: "balanced",
  tableVersion: EVALUATION_MODE_TABLE_VERSION,
  unverifiedEvidenceBaseline: 40,
  requiredWeightFactor: 1.0,
  preferredWeightFactor: 0.5,
  knockoutSoftness: "hard",
  yesMaxRequiredUnverified: 1,
  strongYesMaxRequiredUnverified: 0,
  humanReviewCoverageFloor: 80,
  semantic: { equivalent: 0.85, related: 0.7 },
  tierThresholds: {
    strongYesMinScore: 85,
    strongYesMinCoverage: 80,
    strongYesMinConfidence: 75,
    yesMinScore: 70,
    yesMinCoverage: 65,
    maybeMinScore: 45,
  },
};

const RELAXED: EvaluationModeThresholds = {
  mode: "relaxed",
  tableVersion: EVALUATION_MODE_TABLE_VERSION,
  unverifiedEvidenceBaseline: 50,
  requiredWeightFactor: 1.0,
  preferredWeightFactor: 0.35,
  knockoutSoftness: "soft",
  yesMaxRequiredUnverified: 2,
  strongYesMaxRequiredUnverified: 1,
  humanReviewCoverageFloor: 65,
  semantic: { equivalent: 0.8, related: 0.6 },
  tierThresholds: {
    strongYesMinScore: 80,
    strongYesMinCoverage: 70,
    strongYesMinConfidence: 65,
    yesMinScore: 60,
    yesMinCoverage: 55,
    maybeMinScore: 35,
  },
};

const STRICT: EvaluationModeThresholds = {
  mode: "strict",
  tableVersion: EVALUATION_MODE_TABLE_VERSION,
  unverifiedEvidenceBaseline: 30,
  requiredWeightFactor: 1.0,
  preferredWeightFactor: 0.65,
  knockoutSoftness: "hard",
  yesMaxRequiredUnverified: 0,
  strongYesMaxRequiredUnverified: 0,
  humanReviewCoverageFloor: 85,
  semantic: { equivalent: 0.9, related: 0.8 },
  tierThresholds: {
    strongYesMinScore: 90,
    strongYesMinCoverage: 90,
    strongYesMinConfidence: 85,
    yesMinScore: 80,
    yesMinCoverage: 80,
    maybeMinScore: 55,
  },
};

export const EVALUATION_MODE_THRESHOLDS: Record<EvaluationMode, EvaluationModeThresholds> = {
  relaxed: RELAXED,
  balanced: BALANCED,
  strict: STRICT,
};

export function resolveEvaluationMode(mode?: EvaluationMode | string | null): EvaluationMode {
  if (mode === "relaxed" || mode === "strict" || mode === "balanced") return mode;
  return DEFAULT_EVALUATION_MODE;
}

export function thresholdsForMode(mode?: EvaluationMode | string | null): EvaluationModeThresholds {
  return EVALUATION_MODE_THRESHOLDS[resolveEvaluationMode(mode)];
}
