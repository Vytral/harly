import type { TextProvenance } from "./ats-parser";

export type CriterionType =
  | "skill"
  | "experience_duration"
  | "experience_years"
  | "education"
  | "domain_title"
  | "certification"
  | "license_authorization"
  | "language"
  | "location_availability"
  | "custom";

export type CriterionImportance = "required" | "preferred";

export type CriterionOrigin =
  | "structured_job_field"
  | "recruiter_rubric"
  | "job_description"
  | "application_question"
  | "ai_suggested";

/**
 * Taleo-style constraint kind (Audit doc §3.4). `excluded` is a governed,
 * recruiter-only disqualifier — never derived from job text or AI.
 */
export type CriterionConstraint = "match" | "excluded";

/**
 * Lifecycle of a requirement candidate (Audit doc §3.2 Greenhouse-style
 * calibration + Fase 2). Job-text/AI extraction produces `suggested`
 * requirements that carry no scoring authority until a recruiter approves
 * them into the published rubric.
 */
export type CriterionApprovalStatus = "suggested" | "approved" | "rejected";

export type CriterionStatus =
  | "met"
  | "partially_met"
  | "not_met"
  | "not_demonstrated"
  | "unknown";

export type EvidenceStrength =
  | "demonstrated"
  | "declared"
  | "credentialed"
  | "inferred_assist"
  | "unsubstantiated";

export type MatchMethod =
  | "deterministic_exact"
  | "deterministic_stem"
  | "built_in_alias"
  | "recruiter_alias"
  | "structural_date_calc"
  | "semantic_assist"
  | "ai_resolved";

/** One source fragment retained for an auditable criterion assessment. */
export interface CriterionEvidenceFragment {
  id?: string;
  verbatimSnippet: string;
  strength: EvidenceStrength;
  method: MatchMethod;
  confidence: number;
  provenance: TextProvenance;
}

/**
 * How a skill occurrence was evidenced in the source document.
 * LinkedIn-style explicit/implicit distinction (Audit doc §3.3, §8):
 * a skill is never just a string — the engine must know HOW it was evidenced.
 */
export type SkillEvidenceKind =
  | "declared"            // listed in a Skills section
  | "demonstrated_role"   // mentioned inside a work role (achievement/title)
  | "credentialed"        // associated with a certification/license
  | "application_answer"  // extracted from application Q&A
  | "inferred_assist";    // semantic/taxonomy assist (Phase 6)

/**
 * One raw occurrence of a (possibly normalized) skill in the candidate's sources.
 * Every occurrence carries full provenance and the work-role interval it belongs to,
 * so criterion-specific evidence timelines can be derived independently of scoring.
 */
export interface SkillEvidenceOccurrence {
  rawTerm: string;
  conceptId?: string;
  canonicalName?: string;
  normalizationMethod:
    | "exact"
    | "built_in_alias"
    | "recruiter_alias"
    | "taxonomy"
    | "semantic_assist"
    | "unresolved";
  evidenceKind: SkillEvidenceKind;
  /** Work role this occurrence is attached to, when applicable. */
  roleId?: string;
  /** Bounded evidence interval derived from the containing role (calendar months). */
  interval?: {
    startYear: number;
    startMonth?: number;
    endYear: number;
    endMonth?: number;
    isCurrent: boolean;
    /** true when the role has parseable start/end years, false when the bound is derived heuristically. */
    bounded: boolean;
  };
  /** Explicit claim such as "5 years of Python", separate from role span. */
  explicitDurationMonths?: number;
  provenance: TextProvenance;
}

/**
 * Honest representation of criterion-specific relevant experience.
 * Never claim "4.7 years of React" when the document only supports a bounded
 * evidence window (Audit doc §8 / §23.6 "No false precision").
 */
export interface RelevantDurationResult {
  /** Provable minimum; role windows alone contribute zero without continuity evidence. */
  lowerBoundMonths: number;
  /** Plausible maximum: non-overlapping union of relevant role windows (months). */
  upperBoundMonths: number | null;
  /** Set only for explicit source duration claims. */
  exactMonths: number | null;
  /** Evidence exists in a role that is current at the reference date. */
  isCurrentEvidence: boolean;
  /** ISO date for the most recent bounded evidence, when a source date exists. */
  lastEvidenceDate?: string;
  /** Reference-date-relative month of the most recent evidence, when determinable. */
  lastUsedMonthsAgo?: number;
  sourceRoleIds: string[];
  method: "bounded_interval_union" | "explicit_duration_text" | "unbounded_estimate" | "none";
}

export interface CriterionMatchEvidence extends CriterionEvidenceFragment {
  /** Lower-ranked supporting fragments are retained instead of discarded. */
  supportingEvidence?: CriterionEvidenceFragment[];
  aiResolutionDetails?: {
    modelId: string;
    rationale: string;
    rawEquivalenceConfidence: number;
    /** Phase 6 (§14.2): auditable semantic-assist record. */
    targetConcept?: string;
    modelVersion?: string;
    similarity?: number;
    decision?: "equivalent" | "related" | "not_equivalent" | "uncertain";
  };
  provenance: TextProvenance;
  canonicalSkillName?: string;
  relevantDurationMonths?: number;
  relevantDurationUpperBoundMonths?: number;
  lastEvidenceDate?: string;
}

export interface StructuredCriterionResult {
  criterionId: string;
  label: string;
  type: CriterionType;
  status: CriterionStatus;
  rawScore: number | null;
  weight: number;
  importance: CriterionImportance;
  isKnockout: boolean;
  /** Taleo-style governed exclusion (§3.4). When true, evidence of the skill violates the constraint. */
  excluded?: boolean;
  knockoutFailed: boolean;
  evidence: CriterionMatchEvidence | null;
  missingReason: string | null;
  /** Origin/provenance of the requirement itself, not candidate evidence. */
  origin?: CriterionOrigin;
  sourceProvenance?: TextProvenance;
}
