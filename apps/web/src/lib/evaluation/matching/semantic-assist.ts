/**
 * Optional semantic assist — Phase 6 (Audit doc §14, §24 Phase 6).
 *
 * Semantic matching resolves vocabulary mismatch AFTER deterministic methods
 * (exact → alias → taxonomy). It is assistive, never authoritative:
 *
 * - The provider receives NARROW structured pairs (criterion concept vs
 *   candidate terms), never free-form resume text, never scores, never tools
 *   (§14.5: resumes are untrusted input; prompt injection must have no
 *   channel to scoring authority).
 * - The ENGINE applies confidence thresholds and owns the final status.
 * - Every assisted match is recorded (model, similarity, pair, method) and
 *   escalates to human review (§2.5).
 * - When the provider is disabled/unavailable, evaluation is purely
 *   deterministic — the engine never fails because assist is missing (§14.4).
 *
 * Score grounding (§28.3): semantic equivalence scores 80 — the established
 * `declared` presence precedent — never the demonstrated 100. Semantic
 * relatedness scores 50 (partial midpoint). Both are calibratable via
 * thresholds; benchmark tests lock the behavior.
 */

export interface SemanticEquivalenceQuery {
  /** Canonical criterion concept or label (e.g. "Kubernetes"). */
  sourceConcept: string;
  /** Short candidate-side terms to compare (skills, titles, certifications). */
  candidateConcepts: string[];
}

export type SemanticDecision = "equivalent" | "related" | "not_equivalent" | "uncertain";

export interface SemanticAssistResult {
  sourceConcept: string;
  targetConcept: string;
  modelId: string;
  modelVersion?: string;
  similarity?: number;
  decision: SemanticDecision;
  rationale?: string;
}

export interface SemanticAssistProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  resolveEquivalence(
    query: SemanticEquivalenceQuery,
  ): Promise<SemanticAssistResult | null> | SemanticAssistResult | null;
}

/** Default: assist disabled. Deterministic evaluation is complete on its own. */
export const disabledSemanticAssistProvider: SemanticAssistProvider = {
  providerId: "disabled",
  modelId: "none",
  resolveEquivalence: () => null,
};

export interface SemanticAssistThresholds {
  equivalent: number;
  related: number;
}

/**
 * Confidence thresholds for promoting a provider decision to a criterion
 * status. Deliberately high: semantic matches must earn trust, and every
 * promotion escalates to human review. Tune only with benchmark evidence
 * (§24 Phase 7).
 */
export const DEFAULT_SEMANTIC_THRESHOLDS: SemanticAssistThresholds = {
  equivalent: 0.85,
  related: 0.7,
};

export function resolveSemanticThresholds(
  partial?: Partial<SemanticAssistThresholds>,
): SemanticAssistThresholds {
  return {
    equivalent: partial?.equivalent ?? DEFAULT_SEMANTIC_THRESHOLDS.equivalent,
    related: partial?.related ?? DEFAULT_SEMANTIC_THRESHOLDS.related,
  };
}

export interface AppliedSemanticMatch {
  status: "met" | "partially_met";
  rawScore: number;
}

/**
 * Applies engine-owned thresholds to a provider decision. Returns null when
 * the decision carries no matching authority — the caller must then fall
 * through to `not_demonstrated`, never to a weaker positive.
 */
export function applySemanticThresholds(
  result: SemanticAssistResult,
  thresholds: SemanticAssistThresholds,
): AppliedSemanticMatch | null {
  // A1: similarity is required for authority. Missing/NaN → non-authoritative (null).
  // Never invent similarity=1 for equivalent/related decisions.
  const similarity = result.similarity;
  if (typeof similarity !== "number" || !Number.isFinite(similarity)) {
    return null;
  }
  if (result.decision === "equivalent" && similarity >= thresholds.equivalent) {
    return { status: "met", rawScore: 80 };
  }
  if (
    (result.decision === "equivalent" || result.decision === "related") &&
    similarity >= thresholds.related
  ) {
    return { status: "partially_met", rawScore: 50 };
  }
  return null;
}
