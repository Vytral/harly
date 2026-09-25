import type { CandidateScore } from "@/lib/ai/schemas";
import { parseDocumentFacts, parseResumeFacts, RESUME_PARSER_VERSION, resolveDateContext, type CandidateFactDocument, type TextProvenance } from "./ats-parser";
import { buildStructuredCriteria } from "./criteria-builder";
import { CRITERION_MATCHER_VERSION, matchCriteriaAgainstFacts } from "./ats-matcher";
import { buildCandidateSkillProfiles, type CandidateSkillProfileDocument } from "./skill-profiler";
import { fingerprintSnapshot } from "./snapshot";
import { SKILL_TAXONOMY_VERSION } from "./taxonomy/skill-concepts";
import {
  extractAchievementImpacts,
  topQuantifiedAchievements,
  type AchievementFact,
} from "./impact/metric-extractor";
import {
  disabledSemanticAssistProvider,
  resolveSemanticThresholds,
  type SemanticAssistProvider,
  type SemanticAssistResult,
  type SemanticAssistThresholds,
} from "./matching/semantic-assist";
import type { ParsedResumeDocument } from "./parsing/document";
import {
  thresholdsForMode,
  type EvaluationMode,
  type EvaluationModeThresholds,
} from "./mode";
import type {
  CriterionImportance,
  CriterionOrigin,
  CriterionStatus,
  CriterionType,
  EvidenceStrength,
  MatchMethod,
  StructuredCriterionResult,
} from "./types";

export * from "./types";

/** Immutable engine identifier persisted with every evaluation. */
export const RULES_EVALUATION_VERSION = "rules-v5";

/** Version of the deterministic scoring/tiering projection (Audit doc §5.1). Bump on scoring-behavior changes. */
export const SCORING_VERSION = "scoring-v3";

/**
 * Balanced-mode scoring constants (mirrors thresholdsForMode("balanced")).
 * Prefer thresholdsForMode(evaluationMode) inside the motor; keep this export
 * for tests and backwards-compatible imports.
 */
export const SCORING_CONSTANTS = {
  /** Neutral baseline score for unverified/not_demonstrated criteria */
  UNVERIFIED_EVIDENCE_BASELINE: 40,
  /** Multiplier for preferred criteria weight */
  PREFERRED_WEIGHT_FACTOR: 0.5,
  /** Multiplier for required criteria weight */
  REQUIRED_WEIGHT_FACTOR: 1.0,
  /** Strong Yes tier thresholds */
  STRONG_YES_MIN_SCORE: 85,
  STRONG_YES_MIN_COVERAGE: 80,
  STRONG_YES_MIN_CONFIDENCE: 75,
  /** Yes tier thresholds */
  YES_MIN_SCORE: 70,
  YES_MIN_COVERAGE: 65,
  /** Maybe tier minimum threshold */
  MAYBE_MIN_SCORE: 45,
} as const;

export type EvaluationSnapshotConfiguration = {
  evaluationMode: EvaluationMode;
  modeTableVersion: string;
  neutralEvidenceBaseline: number;
  requiredWeightFactor: number;
  preferredWeightFactor: number;
  knockoutSoftness: EvaluationModeThresholds["knockoutSoftness"];
  semanticThresholds: EvaluationModeThresholds["semantic"];
  tierThresholds: {
    strongYesMinScore: number;
    strongYesMinCoverage: number;
    strongYesMinConfidence: number;
    yesMinScore: number;
    yesMinCoverage: number;
    maybeMinScore: number;
  };
};

/**
 * Versioned snapshot metadata (Audit doc §5.1). Every evaluation carries
 * enough identity to be replayed and audited: which layer versions ran,
 * fingerprints of the exact inputs, and the active scoring configuration.
 * Pre-existing fields keep their names and types.
 */
export type EvaluationMetadata = {
  engineVersion: string;
  parserVersion: string;
  matcherVersion: string;
  scoringVersion: string;
  taxonomyVersion: string;
  /** Version of the persisted rich per-criterion assessment payload. */
  criterionResultSchemaVersion: 2;
  /** DB-assigned on persist; optional passthrough so replay inputs stay byte-identical. */
  evaluationId?: string;
  referenceDate: string;
  evaluatedAt: string;
  totalCriteriaCount: number;
  scoredCriteriaCount: number;
  neutralEvidenceBaseline: number;
  /** Fingerprint of the raw resume text that was evaluated. */
  resumeSourceHash: string;
  /** Fingerprint of the parsed CandidateFactDocument. */
  candidateFactsHash: string;
  /** Fingerprint of the structured criteria the matcher ran against. */
  rubricHash: string;
  /** Phase 6 (§5.1): semantic model identity, present only when assist applied. */
  semanticModelVersion?: string;
  configuration: EvaluationSnapshotConfiguration;
};

export type RulesCriterion = {
  key: string;
  label: string;
  type: CriterionType;
  importance: CriterionImportance;
  weight: number;
  aliases: string[];
  origin?: CriterionOrigin;
  canonicalName?: string;
  conceptId?: string;
  targetTokens?: string[];
  sourceProvenance?: TextProvenance;
  minimumValue?: number;
  /** Degree rank 1–5 when type === "education" (C2). Prefer over inventing bachelor. */
  minimumEducationLevelRank?: number;
  isKnockout?: boolean;
  /** Taleo-style governed exclusion (§3.4). Recruiter-only; forces disqualification when matched-as-failed. */
  excluded?: boolean;
};

export type RulesRubric = {
  version: string;
  criteria: RulesCriterion[];
};

export type RuleCriterionResult = {
  key: string;
  label: string;
  status: "met" | "not_met" | "unknown";
  score: number | null;
  weight: number;
  evidence: string | null;
  evidenceSource: "resume" | "profile" | "evaluation" | null;
  confidence: number;
  missingReason: string | null;
  // Extended v4 fields:
  extendedStatus?: CriterionStatus;
  evidenceStrength?: EvidenceStrength;
  matchMethod?: MatchMethod;
  isKnockout?: boolean;
};

export type RulesEvaluation = {
  result: CandidateScore;
  rubric: RulesRubric;
  criterionResults: RuleCriterionResult[];
  evidenceCoverage: number;
  confidence: number;
  requiresHumanReview: boolean;
  // Extended v4 metrics:
  demonstratedScore: number;
  coverageAdjustedScore: number;
  metadata: EvaluationMetadata;
  /** Immutable structured inputs used by the deterministic matcher. */
  candidateFacts: CandidateFactDocument;
  skillProfiles: CandidateSkillProfileDocument;
  /** Full-fidelity criterion assessments for replay/audit. Unlike the legacy
   * `criterionResults`, this preserves status, provenance, match method,
   * semantic-assist details, and relevant-duration evidence. */
  criterionAssessments: StructuredCriterionResult[];
  /**
   * Phase 5 (§13): top quantified achievements in document order.
   * Evidence enrichment ONLY — never read by scoring, tiers, or gates.
   */
  impactHighlights: AchievementFact[];
};

export type RulesInput = {
  job: {
    title: string;
    description: string;
    requirements: string | null;
    sector?: string | null;
    experienceLevel: string | null;
    education: string | null;
    keywords: string[];
    evaluationMode?: EvaluationMode;
  };
  candidate: {
    fullName?: string;
    email?: string | null;
    headline?: string | null;
    location?: string | null;
    resumeText: string | null;
    answers: Array<{ question: string; answer: string }>;
    skills?: string[];
    experienceYears?: number | null;
  };
  rubric?: RulesRubric;
  referenceDate?: string;
  /** Optional ISO timestamp override. Defaults to now; pin it in tests/replay for byte-identical output. */
  evaluatedAt?: string;
  /** Optional caller-provided evaluation id, recorded verbatim in metadata. */
  evaluationId?: string;
  /**
   * Phase 2 exit gate — rescore without reparse (Audit doc §24 Phase 2).
   * When the resume has not changed, callers may pass back previously derived
   * snapshots (e.g. from `candidateFactsSnapshot` / `skillProfilesSnapshot`
   * persistence) so a rubric change re-runs match/score only. Hashes are
   * recomputed from the provided snapshots, keeping replay identity intact.
   * Snapshots with an incompatible `schemaVersion` are rejected loudly rather
   * than silently mis-scored. Provided snapshots are never mutated.
   */
  candidateFacts?: CandidateFactDocument;
  skillProfiles?: CandidateSkillProfileDocument;
  /**
   * Phase 4 (§6): layout-aware source document. Parse-source precedence is
   * explicit snapshots (rescore) > source document (block/page provenance) >
   * raw text (text-layer parse). The hash fingerprints the text actually
   * evaluated (`sourceDocument.plainText` when provided).
   */
  sourceDocument?: ParsedResumeDocument;
  /**
   * Phase 6 (§14): semantic assist. The SYNC entry honors precomputed
   * `semanticResolutions` (data: replayable, testable, no I/O) but REJECTS a
   * non-disabled provider — network I/O has no place in the deterministic
   * path. Use `evaluateCandidateWithRulesAsync` when a provider is configured.
   */
  semanticAssist?: { provider: SemanticAssistProvider };
  semanticThresholds?: SemanticAssistThresholds;
  semanticResolutions?: Map<string, SemanticAssistResult>;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Phase 6 (§5.1, §14.3): model identity for the audit trail, if assist applied. */
function collectSemanticModelVersion(
  matchedResults: StructuredCriterionResult[],
): { semanticModelVersion?: string } {
  const models = [
    ...new Set(
      matchedResults.flatMap((result) =>
        result.evidence?.aiResolutionDetails?.modelId
          ? [result.evidence.aiResolutionDetails.modelId]
          : [],
      ),
    ),
  ];
  return models.length > 0 ? { semanticModelVersion: models.join(",") } : {};
}

/**
 * Deterministic candidate evaluation with coverage-adjusted score shrinkage.
 *
 * Sync contract: deterministic-only. Precomputed `semanticResolutions` are
 * honored (replayable data); a configured network provider is rejected loudly
 * — semantic evaluation goes through `evaluateCandidateWithRulesAsync`.
 */
export function evaluateCandidateWithRules(input: RulesInput): RulesEvaluation {
  const semanticProvider = input.semanticAssist?.provider;
  if (semanticProvider && semanticProvider.providerId !== disabledSemanticAssistProvider.providerId) {
    throw new Error(
      "Semantic assist requires evaluateCandidateWithRulesAsync: the sync entry is deterministic-only.",
    );
  }
  const resumeText = input.candidate.resumeText ?? "";
  if (input.candidateFacts && input.candidateFacts.schemaVersion !== 2) {
    throw new Error(
      `Incompatible candidateFacts snapshot (schemaVersion ${input.candidateFacts.schemaVersion}); reparse from resume text instead of rescoring.`,
    );
  }
  if (input.skillProfiles && input.skillProfiles.schemaVersion !== 2) {
    throw new Error(
      `Incompatible skillProfiles snapshot (schemaVersion ${input.skillProfiles.schemaVersion}); rebuild from candidate facts instead of rescoring.`,
    );
  }
  const dateCtx = resolveDateContext(input.referenceDate ?? input.candidateFacts?.referenceDate);
  const effectiveText = input.sourceDocument?.plainText ?? resumeText;
  let facts = input.candidateFacts ?? (input.sourceDocument
    ? parseDocumentFacts(input.sourceDocument, dateCtx)
    : parseResumeFacts(effectiveText, dateCtx));

  // If candidate had explicit experience years in DB that exceed parsed, use maximum.
  // Copy-on-write: caller-provided snapshots must never be mutated.
  if (input.candidate.experienceYears && input.candidate.experienceYears > facts.totalExperienceYears) {
    facts = {
      ...facts,
      totalExperienceYears: input.candidate.experienceYears,
      totalWorkDurationMonths: Math.round(input.candidate.experienceYears * 12),
    };
  }

  const structuredCriteria = buildStructuredCriteria(input);
  const skillProfiles = input.skillProfiles ?? buildCandidateSkillProfiles(facts, {
    answers: input.candidate.answers,
    profileSkills: input.candidate.skills,
  });
  // Phase 5: quantified evidence for recruiter comprehension. Computed from
  // facts, displayed in the UI, and persisted — scoring below never reads it.
  const impactHighlights = topQuantifiedAchievements(extractAchievementImpacts(facts));
  // evaluationMode drives versioned thresholds (coverage, preferred weight, tiers, semantic).
  const modeThresholds = thresholdsForMode(input.job.evaluationMode);
  const semanticThresholds = resolveSemanticThresholds(
    input.semanticThresholds ?? modeThresholds.semantic,
  );

  const matchedResults = matchCriteriaAgainstFacts(structuredCriteria, facts, {
    answers: input.candidate.answers,
    profileSkills: input.candidate.skills,
    semanticResolutions: input.semanticResolutions,
    semanticThresholds,
  }).map((result) => {
    const criterion = structuredCriteria.find((item) => item.id === result.criterionId);
    return criterion
      ? { ...result, origin: criterion.origin, sourceProvenance: criterion.sourceProvenance }
      : result;
  });

  // Calculate weighted demonstrated score and evidence coverage
  let totalRubricWeight = 0;
  let scoredRubricWeight = 0;
  let weightedDemonstratedSum = 0;
  let confidenceSum = 0;

  for (const cr of matchedResults) {
    const importanceFactor =
      cr.importance === "required"
        ? modeThresholds.requiredWeightFactor
        : modeThresholds.preferredWeightFactor;
    const effectiveWeight = cr.weight * importanceFactor;
    totalRubricWeight += effectiveWeight;

    if (cr.rawScore !== null) {
      scoredRubricWeight += effectiveWeight;
      weightedDemonstratedSum += effectiveWeight * cr.rawScore;
      confidenceSum += cr.evidence?.confidence ?? 80;
    }
  }

  const scoredCount = matchedResults.filter((r) => r.rawScore !== null).length;
  const demonstratedScore = scoredRubricWeight > 0
    ? clamp(weightedDemonstratedSum / scoredRubricWeight)
    : 0;

  const rawCoverage = totalRubricWeight > 0 ? (scoredRubricWeight / totalRubricWeight) * 100 : 0;
  const evidenceCoverage = clamp(rawCoverage);

  // Coverage-adjusted score with mode-specific shrinkage toward neutral baseline
  const coverageRatio = evidenceCoverage / 100;
  const coverageAdjustedScore = clamp(
    coverageRatio * demonstratedScore + (1 - coverageRatio) * modeThresholds.unverifiedEvidenceBaseline,
  );

  const confidence = scoredCount > 0
    ? clamp(confidenceSum / scoredCount)
    : 0;

  // Determine Knockout Failures
  const anyKnockoutFailed = matchedResults.some((r) => r.knockoutFailed);

  // Phase 6 (§2.5): any semantic/AI-assisted match escalates to human review.
  const anySemanticAssist = matchedResults.some((r) => r.evidence?.method === "semantic_assist");

  // Required criteria inspection
  const requiredCriteria = matchedResults.filter((r) => r.importance === "required");
  const requiredNotMetCount = requiredCriteria.filter((r) => r.status === "not_met").length;
  const requiredUnverifiedCount = requiredCriteria.filter(
    (r) => r.status === "not_demonstrated" || r.status === "unknown",
  ).length;

  // Recommendation Tiers (Deterministic) — mode-thresholded
  const tiers = modeThresholds.tierThresholds;
  const knockoutBlocksRecommendation =
    modeThresholds.knockoutSoftness === "hard"
      ? anyKnockoutFailed
      : matchedResults.some((r) => r.knockoutFailed && r.status === "not_met");

  const recommendation: CandidateScore["recommendation"] =
    knockoutBlocksRecommendation || requiredNotMetCount >= 2 || coverageAdjustedScore < tiers.maybeMinScore
      ? "no"
      : coverageAdjustedScore >= tiers.strongYesMinScore &&
          evidenceCoverage >= tiers.strongYesMinCoverage &&
          confidence >= tiers.strongYesMinConfidence &&
          requiredNotMetCount === 0 &&
          requiredUnverifiedCount <= modeThresholds.strongYesMaxRequiredUnverified
        ? "strong_yes"
        : coverageAdjustedScore >= tiers.yesMinScore &&
            evidenceCoverage >= tiers.yesMinCoverage &&
            requiredNotMetCount === 0 &&
            requiredUnverifiedCount <= modeThresholds.yesMaxRequiredUnverified
          ? "yes"
          : "maybe";

  // Human Review Required Trigger
  const requiresHumanReview =
    anyKnockoutFailed ||
    anySemanticAssist ||
    requiredUnverifiedCount > 0 ||
    evidenceCoverage < modeThresholds.humanReviewCoverageFloor ||
    confidence < 70 ||
    facts.workTimelineConfidence === "low";

  // Map to backwards-compatible RuleCriterionResult
  const criterionResults: RuleCriterionResult[] = matchedResults.map((m) => {
    const legacyStatus =
      m.status === "met" ? "met" : m.status === "not_met" ? "not_met" : "unknown";

    return {
      key: m.criterionId,
      label: m.label,
      status: legacyStatus,
      score: m.rawScore,
      weight: m.weight,
      evidence: m.evidence?.verbatimSnippet ?? null,
      evidenceSource: m.evidence ? (m.evidence.provenance.sourceType === "resume" ? "resume" : "profile") : null,
      confidence: m.evidence?.confidence ?? 0,
      missingReason: m.missingReason,
      extendedStatus: m.status,
      evidenceStrength: m.evidence?.strength,
      matchMethod: m.evidence?.method,
      isKnockout: m.isKnockout,
    };
  });

  // Strengths & Gaps Synthesis
  const strengths: string[] = [];
  if (facts.workHistory.length > 0 && facts.totalExperienceYears >= 2) {
    strengths.push(
      `Experience: ${facts.totalExperienceYears} years of verified background across ${facts.workHistory.length} roles (${facts.workHistory.map((w) => w.company).slice(0, 3).join(", ")}).`,
    );
  }
  for (const m of matchedResults) {
    if (m.status === "met" && m.evidence && m.type !== "experience_duration") {
      strengths.push(`${m.label}: ${m.evidence.verbatimSnippet}`);
    }
  }

  const gaps: string[] = [];
  for (const m of matchedResults) {
    if (m.status === "not_met") {
      gaps.push(`${m.label}: ${m.missingReason ?? "Did not meet stated requirement."}`);
    } else if (m.status === "not_demonstrated" && m.importance === "required") {
      gaps.push(`${m.label}: Unverified — ${m.missingReason ?? "No mention in resume."}`);
    }
  }

  // Prefer full criterionAssessments as source of truth. Legacy CandidateScore.criteria
  // adapter keeps a truncated view for older AI-schema consumers — do NOT coerce null→0
  // here for extended assessments (those live on criterionAssessments / criterionResults.score).
  const criteriaResult = criterionResults.map((c) => ({
    label: c.label,
    // Preserve null for unverified criteria. Callers that require a number must
    // use criterionAssessments and treat null as "—" / excluded from denominator.
    score: c.score as number | null,
    evidence: c.evidence,
  }));

  const summary = requiresHumanReview
    ? `Automatic evaluation verified ${scoredCount}/${matchedResults.length} criteria (${evidenceCoverage}% coverage). Human review is recommended because some required information is unverified or incomplete.`
    : `Automatic evaluation verified ${scoredCount}/${matchedResults.length} criteria with high confidence (${evidenceCoverage}% coverage, ${confidence}% confidence).`;

  const rubric: RulesRubric = input.rubric ?? {
    version: RULES_EVALUATION_VERSION,
    criteria: structuredCriteria.map((c) => ({
      key: c.id,
      label: c.label,
      type: c.type,
      importance: c.importance,
      weight: c.weight,
      aliases: c.recruiterAliases,
      origin: c.origin,
      canonicalName: c.canonicalName,
      conceptId: c.conceptId,
      targetTokens: c.targetTokens,
      sourceProvenance: c.sourceProvenance,
      minimumValue: c.minimumMonths
        ? Math.round(c.minimumMonths / 12)
        : c.minimumEducationLevelRank,
      minimumEducationLevelRank: c.minimumEducationLevelRank,
      isKnockout: c.isKnockout,
      excluded: c.excluded,
    })),
  };

  const metadata: EvaluationMetadata = {
    engineVersion: RULES_EVALUATION_VERSION,
    parserVersion: RESUME_PARSER_VERSION,
    matcherVersion: CRITERION_MATCHER_VERSION,
    scoringVersion: SCORING_VERSION,
    taxonomyVersion: SKILL_TAXONOMY_VERSION,
    criterionResultSchemaVersion: 2,
    ...(input.evaluationId ? { evaluationId: input.evaluationId } : {}),
    ...collectSemanticModelVersion(matchedResults),
    referenceDate: dateCtx.referenceDateStr,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    totalCriteriaCount: matchedResults.length,
    scoredCriteriaCount: scoredCount,
    neutralEvidenceBaseline: modeThresholds.unverifiedEvidenceBaseline,
    resumeSourceHash: fingerprintSnapshot(effectiveText),
    candidateFactsHash: fingerprintSnapshot(facts),
    rubricHash: fingerprintSnapshot(structuredCriteria),
    configuration: {
      evaluationMode: modeThresholds.mode,
      modeTableVersion: modeThresholds.tableVersion,
      neutralEvidenceBaseline: modeThresholds.unverifiedEvidenceBaseline,
      requiredWeightFactor: modeThresholds.requiredWeightFactor,
      preferredWeightFactor: modeThresholds.preferredWeightFactor,
      knockoutSoftness: modeThresholds.knockoutSoftness,
      semanticThresholds: modeThresholds.semantic,
      tierThresholds: { ...modeThresholds.tierThresholds },
    },
  };

  return {
    rubric,
    criterionResults,
    evidenceCoverage,
    confidence,
    requiresHumanReview,
    demonstratedScore,
    coverageAdjustedScore,
    metadata,
    candidateFacts: facts,
    skillProfiles,
    criterionAssessments: matchedResults,
    impactHighlights,
    result: {
      score: coverageAdjustedScore,
      recommendation,
      summary,
      // Legacy AI schema adapter: truncate narrative lists only. Full assessments
      // are on criterionAssessments (canonical UI / persistence path).
      strengths: strengths.slice(0, 8),
      gaps: gaps.slice(0, 8),
      criteria: criteriaResult.map((c) => ({
        label: c.label,
        // Legacy CandidateScore.criteria historically used number; keep null→0 ONLY
        // in this truncated adapter so old consumers do not crash. Canonical path:
        // criterionAssessments[].rawScore (null means unverified, not zero).
        score: c.score ?? 0,
        evidence: c.evidence,
      })).slice(0, 8),
    },
  };
}

export function scoreCandidateWithRules(input: RulesInput): CandidateScore {
  return evaluateCandidateWithRules(input).result;
}

/**
 * Re-evaluate only from persisted deterministic inputs. This is the explicit
 * replay boundary used by audits and historical verification: facts, skill
 * profiles, rubric, reference date, and evaluation timestamp are all pinned;
 * no document parser, wall clock, or semantic provider is consulted.
 */
export function replayRulesEvaluation(input: {
  rubric: RulesRubric;
  candidateFacts: CandidateFactDocument;
  skillProfiles: CandidateSkillProfileDocument;
  metadata: Pick<EvaluationMetadata, "referenceDate" | "evaluatedAt" | "evaluationId">;
}): RulesEvaluation {
  return evaluateCandidateWithRules({
    job: {
      title: "Persisted rubric replay",
      description: "",
      requirements: null,
      experienceLevel: null,
      education: null,
      keywords: [],
    },
    candidate: {
      resumeText: input.candidateFacts.rawText,
      answers: [],
    },
    rubric: input.rubric,
    referenceDate: input.metadata.referenceDate,
    evaluatedAt: input.metadata.evaluatedAt,
    evaluationId: input.metadata.evaluationId,
    candidateFacts: input.candidateFacts,
    skillProfiles: input.skillProfiles,
  });
}

/**
 * Short candidate-side terms for structured semantic comparison (§14.5).
 * Skills, titles, and certifications only — never free-form resume prose,
 * never scores. The provider decides between pairs; the engine owns status.
 */
function collectCandidateTerms(
  facts: CandidateFactDocument,
  input: RulesInput,
): string[] {
  const terms = new Set<string>();
  for (const skill of facts.declaredSkills) terms.add(skill.name);
  for (const role of facts.workHistory) terms.add(role.title);
  for (const cert of facts.certifications) terms.add(cert.name);
  for (const skill of input.candidate.skills ?? []) terms.add(skill);
  return [...terms].filter((term) => term.trim().length > 1).slice(0, 100);
}

/**
 * Semantic-capable evaluation — Phase 6 (§14).
 *
 * Two-pass design preserving the deterministic core: pass 1 runs the sync
 * evaluator; pass 2 re-runs it with provider resolutions for criteria the
 * deterministic methods could not resolve (skill/title only). Provider
 * failure, empty resolutions, or a disabled provider all degrade to the
 * identical deterministic result (§14.4).
 */
export async function evaluateCandidateWithRulesAsync(input: RulesInput): Promise<RulesEvaluation> {
  const provider = input.semanticAssist?.provider;
  if (!provider || provider.providerId === disabledSemanticAssistProvider.providerId) {
    return evaluateCandidateWithRules(input);
  }

  const baseline = evaluateCandidateWithRules({ ...input, semanticAssist: undefined });
  const structured = buildStructuredCriteria(input);
  const unresolved = structured.filter(
    (criterion) =>
      (criterion.type === "skill" || criterion.type === "domain_title") &&
      baseline.criterionResults.some(
        (result) =>
          result.key === criterion.id &&
          (result.extendedStatus === "not_demonstrated" || result.extendedStatus === "unknown"),
      ),
  );
  if (unresolved.length === 0) return baseline;

  const candidateTerms = collectCandidateTerms(baseline.candidateFacts, input);
  const resolutions = new Map<string, SemanticAssistResult>();
  for (const criterion of unresolved) {
    try {
      const result = await provider.resolveEquivalence({
        sourceConcept: criterion.canonicalName ?? criterion.label,
        candidateConcepts: candidateTerms,
      });
      if (result) resolutions.set(criterion.id, result);
    } catch {
      // Provider failure is never an evaluation failure (§14.4).
    }
  }
  if (resolutions.size === 0) return baseline;

  return evaluateCandidateWithRules({
    ...input,
    semanticAssist: undefined,
    semanticResolutions: resolutions,
  });
}

export function defaultRulesRubric(input: RulesInput): RulesRubric {
  return evaluateCandidateWithRules(input).rubric;
}
