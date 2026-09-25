/**
 * Job Intelligence — requirement extraction & recruiter calibration (Phase 2,
 * Audit doc §3.2, §3.4, §9, §24 Phase 2).
 *
 * Converts a free-text job description into structured requirement candidates
 * with full provenance, and governs how those candidates become authoritative
 * criteria. Hard guarantees:
 *
 * - Extraction is deterministic and evidence-backed (every candidate carries
 *   the exact JD line/span it came from).
 * - Job text / AI can ONLY produce `suggested` requirements with importance
 *   `preferred` and `isKnockout: false`. Required/knockout/excluded status is
 *   reserved for explicit recruiter approval (§2.3, Fase 2 exit gate).
 * - `excluded` constraints are a governed, recruiter-only disqualifier (§3.4).
 */

import type {
  CriterionApprovalStatus,
  CriterionConstraint,
  CriterionImportance,
  CriterionOrigin,
  CriterionType,
} from "./types";
import type { TextProvenance } from "./ats-parser";
import type { RulesRubric } from "./rules";
import { cleanLine } from "./ats-parser";
import {
  matchSkillConceptsInText,
  resolveSkillConcept,
} from "./taxonomy/skill-concepts";

/** A requirement mined from raw job text, before any recruiter decision. */
export interface RequirementCandidate {
  id: string;
  label: string;
  type: CriterionType;
  /** Always "job_description" or "ai_suggested" for extracted candidates. */
  origin: Extract<CriterionOrigin, "job_description" | "ai_suggested">;
  /** Canonical taxonomy concept when the requirement is a known skill. */
  conceptId?: string;
  canonicalName?: string;
  /** Extracted tenure constraint (months), e.g. "5+ years Python" -> 60. */
  minimumMonths?: number;
  /** Extracted education floor (rank 1-5), e.g. "Bachelor's required" -> 3. */
  minimumEducationLevelRank?: number;
  /** True when the JD marks this as required (must/essential/required...). */
  requiredSignal: boolean;
  /** Exact source span in the job description. */
  provenance: TextProvenance;
}

/** A criterion after the recruiter's calibration decision. */
export interface GovernedCriterion {
  id: string;
  label: string;
  type: CriterionType;
  origin: CriterionOrigin;
  approval: CriterionApprovalStatus;
  importance: CriterionImportance;
  constraint: CriterionConstraint;
  isKnockout: boolean;
  weight: number;
  conceptId?: string;
  canonicalName?: string;
  minimumMonths?: number;
  minimumEducationLevelRank?: number;
  recruiterAliases: string[];
  provenance?: TextProvenance;
}

const REQUIRED_CUE =
  /\b(required|must(?:\s+have)?|mandatory|essential|requisito|obligatorio|excluyente|need(?:ed)?\s+to\s+have|at\s+least)\b/i;
const TENURE_RE =
  /(\d{1,2})\s*\+?\s*(?:years?|yrs?|años?)\s*(?:of\s+)?(?:experience\s+(?:in|with)\s+)?([A-Za-z][A-Za-z0-9+#./-]*)?/gi;
const EDU_RE =
  /\b(ph\.?\s?d|doctorate|master'?s?|m\.?\s?sc|mba|magister|maestr[ií]a|bachelor'?s?|b\.?\s?sc|b\.?\s?a|associate'?s?|licenciatura|ingenier[ií]a|high\s+school|secondary)\b/i;

function eduRank(match: string): number {
  const t = match.toLowerCase();
  if (/ph|doctor/.test(t)) return 5;
  if (/master|m\.?\s?sc|mba|magister|maestr/.test(t)) return 4;
  if (/bachelor|b\.?\s?sc|b\.?\s?a|licenciatura|ingenier/.test(t)) return 3;
  if (/associate/.test(t)) return 2;
  return 1;
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "-")
    .replace(/^-+|-+$/g, "") || "requirement";
}

/**
 * Extracts requirement candidates from a free-text job description.
 * Deterministic; every candidate carries provenance to its JD line.
 *
 * Strategy per line:
 *  1. Tenure constraints ("5+ years Python", "3 yrs experience in Kubernetes")
 *  2. Education floors ("Bachelor's degree required")
 *  3. Known skill concepts mentioned (via taxonomy scan)
 */
export function extractRequirementCandidates(
  jobDescription: string,
  options?: { origin?: "job_description" | "ai_suggested" },
): RequirementCandidate[] {
  const origin = options?.origin ?? "job_description";
  const candidates: RequirementCandidate[] = [];
  const seenConcept = new Set<string>();
  const seenLabel = new Set<string>();
  const lines = jobDescription.split(/\r?\n/);

  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = cleanLine(raw);
    const lineStart = charOffset;
    charOffset += raw.length + 1;
    if (!line || line.length < 3) continue;

    const requiredSignal = REQUIRED_CUE.test(line);
    const provenance: TextProvenance = {
      sourceType: "job_description",
      rawText: line,
      lineIndex: i,
      charStart: lineStart,
      charEnd: lineStart + raw.length,
    };

    // 1. Tenure constraints, tied to a specific skill when named.
    for (const m of line.matchAll(new RegExp(TENURE_RE.source, "gi"))) {
      const years = Number(m[1]);
      const skillWord = (m[2] ?? "").trim();
      if (!Number.isFinite(years) || years <= 0) continue;
      const resolved = skillWord ? resolveSkillConcept(skillWord) : null;
      const isSkillTenure = resolved?.conceptId;
      const label = isSkillTenure
        ? resolved.canonicalName
        : `${years}+ years experience`;
      const key = `${isSkillTenure ? resolved!.conceptId : "exp"}:${years}`;
      if (seenLabel.has(key)) continue;
      seenLabel.add(key);
      candidates.push({
        id: `jd:${isSkillTenure ? "skill-tenure" : "exp"}:${slugify(label)}`,
        label,
        type: isSkillTenure ? "skill" : "experience_duration",
        origin,
        conceptId: resolved?.conceptId,
        canonicalName: resolved?.canonicalName,
        minimumMonths: years * 12,
        requiredSignal,
        provenance,
      });
      if (isSkillTenure) seenConcept.add(resolved!.conceptId!);
    }

    // 2. Education floor.
    const eduMatch = line.match(EDU_RE);
    if (eduMatch && /degree|education|titulo|t[ií]tulo|required|preferred|or\s+equivalent/i.test(line)) {
      const rank = eduRank(eduMatch[1]!);
      const key = `edu:${rank}`;
      if (!seenLabel.has(key)) {
        seenLabel.add(key);
        candidates.push({
          id: "jd:education",
          label: "Education",
          type: "education",
          origin,
          minimumEducationLevelRank: rank,
          requiredSignal,
          provenance,
        });
      }
    }

    // 3. Skill concepts mentioned in the line (not already captured w/ tenure).
    for (const resolved of matchSkillConceptsInText(line)) {
      if (!resolved.conceptId || seenConcept.has(resolved.conceptId)) continue;
      seenConcept.add(resolved.conceptId);
      candidates.push({
        id: `jd:skill:${slugify(resolved.canonicalName)}`,
        label: resolved.canonicalName,
        type: "skill",
        origin,
        conceptId: resolved.conceptId,
        canonicalName: resolved.canonicalName,
        requiredSignal,
        provenance,
      });
    }
  }

  return candidates;
}

/**
 * Default governance for an extracted (unreviewed) candidate.
 *
 * HARD RULES (§2.3, Fase 2 exit gate):
 * - Suggested criteria are NEVER knockouts.
 * - Suggested criteria NEVER carry the `excluded` constraint.
 * - A `requiredSignal` from JD text only *recommends* required; the candidate
 *   still starts as `preferred` until a recruiter approves it.
 */
export function toSuggestedCriterion(candidate: RequirementCandidate): GovernedCriterion {
  return {
    id: candidate.id,
    label: candidate.label,
    type: candidate.type,
    origin: candidate.origin,
    approval: "suggested",
    importance: "preferred", // never auto-required from text
    constraint: "match",
    isKnockout: false,
    weight: candidate.type === "experience_duration" ? 25 : candidate.type === "education" ? 15 : 50,
    conceptId: candidate.conceptId,
    canonicalName: candidate.canonicalName,
    minimumMonths: candidate.minimumMonths,
    minimumEducationLevelRank: candidate.minimumEducationLevelRank,
    recruiterAliases: [],
    provenance: candidate.provenance,
  };
}

export interface ApproveCriterionDecision {
  /** Recruiter confirms the requirement is real and job-related. */
  approve: boolean;
  /** Recruiter may upgrade to required. Only honored when approve=true. */
  importance?: CriterionImportance;
  /** Recruiter may explicitly mark knockout. Only honored when approve=true AND importance=required. */
  isKnockout?: boolean;
  /** Recruiter-only governed exclusion (§3.4). Requires approve=true. Forces importance=required. */
  constraint?: CriterionConstraint;
  /** Recruiter-provided aliases for canonicalization (§3.2). */
  recruiterAliases?: string[];
  weight?: number;
}

/**
 * Applies a recruiter decision to a suggested criterion, producing the
 * authoritative governed criterion that may enter a published rubric.
 *
 * Enforces governance invariants regardless of caller input:
 * - Rejected / unapproved -> stays suggested, preferred, non-knockout, match-only.
 * - Knockout requires importance=required.
 * - `excluded` constraint forces importance=required and is recruiter-only.
 * - Origin becomes "recruiter_rubric" once approved (provenance preserved).
 */
export function applyRecruiterDecision(
  candidate: RequirementCandidate,
  decision: ApproveCriterionDecision,
): GovernedCriterion {
  const base = toSuggestedCriterion(candidate);
  if (!decision.approve) {
    return { ...base, approval: "rejected" };
  }

  const importance: CriterionImportance = decision.importance ?? "required";
  const constraint: CriterionConstraint = decision.constraint ?? "match";
  const isExcluded = constraint === "excluded";
  // Exclusion is a hard disqualifier -> required by definition.
  const finalImportance: CriterionImportance = isExcluded ? "required" : importance;
  // Knockout only when required (or excluded) AND explicitly requested.
  const isKnockout = Boolean(decision.isKnockout) && finalImportance === "required";

  return {
    ...base,
    origin: "recruiter_rubric",
    approval: "approved",
    importance: finalImportance,
    constraint,
    isKnockout,
    weight: decision.weight ?? base.weight,
    recruiterAliases: decision.recruiterAliases ?? [],
  };
}

/**
 * Converts an approved governed criterion into the engine-facing rubric shape
 * consumed by buildStructuredCriteria / RulesInput.rubric. Suggested or
 * rejected criteria are excluded — only approved criteria are authoritative.
 */
export function toRubricCriterion(g: GovernedCriterion): {
  key: string;
  label: string;
  type: GovernedCriterion["type"];
  origin: CriterionOrigin;
  importance: CriterionImportance;
  weight: number;
  aliases: string[];
  sourceProvenance?: TextProvenance;
  minimumValue?: number;
  isKnockout: boolean;
  excluded: boolean;
} | null {
  if (g.approval !== "approved") return null;
  return {
    key: g.id,
    label: g.label,
    type: g.type,
    origin: g.origin,
    importance: g.importance,
    weight: g.weight,
    aliases: g.recruiterAliases,
    sourceProvenance: g.provenance,
    minimumValue: g.minimumMonths ? Math.round(g.minimumMonths / 12) : undefined,
    isKnockout: g.isKnockout,
    excluded: g.constraint === "excluded",
  };
}

/** Full pipeline: JD text -> approved rubric criteria (skips non-approved). */
export function buildGovernedCriteriaFromJobDescription(
  jobDescription: string,
  decisions?: Record<string, ApproveCriterionDecision>,
): GovernedCriterion[] {
  const candidates = extractRequirementCandidates(jobDescription);
  return candidates.map((c) => {
    const decision = decisions?.[c.id];
    return decision ? applyRecruiterDecision(c, decision) : toSuggestedCriterion(c);
  });
}

/**
 * Closes the Phase 2 loop at lib level: approved governed criteria become an
 * engine-ready published rubric. Suggested/rejected candidates never enter —
 * only recruiter-approved criteria are authoritative (§9, Fase 2 exit gate).
 * The returned rubric is immutable input for an evaluation: evaluations
 * snapshot it, never mutate it (§5.3).
 */
export function toApprovedRubric(version: string, governed: GovernedCriterion[]): RulesRubric {
  return {
    version,
    criteria: governed.flatMap((item) => {
      const criterion = toRubricCriterion(item);
      return criterion ? [criterion] : [];
    }),
  };
}

/**
 * §16.5 safeguard: detect ambiguous / potentially inappropriate criteria that
 * must NOT be auto-scored (soft-skill / biased / proxy terms). Returns human-
 * readable flags; callers should warn recruiters and require clarification.
 */
const INAPPROPRIATE_CRITERION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bculture\s+fit\b/i, reason: "'Culture fit' is subjective and bias-prone; require a job-related behavior instead." },
  { pattern: /\b(young|energetic|dynamic\s+(?:young|person)|native\s+speaker)\b/i, reason: "Age/personality/nationality-adjacent descriptors are not job-relevant and may be discriminatory." },
  { pattern: /\b(charismatic|aggressive|hungry|rockstar|ninja|guru)\b/i, reason: "Personality/hype descriptors are not measurable job criteria." },
  { pattern: /\b(he|she|his|her|male|female|man|woman)\s+(?:who|must|should)\b/i, reason: "Gendered requirements are prohibited." },
];

export interface CriterionWarning {
  candidateId: string;
  label: string;
  reason: string;
}

export function flagInappropriateCandidates(
  candidates: RequirementCandidate[],
): CriterionWarning[] {
  const warnings: CriterionWarning[] = [];
  for (const c of candidates) {
    const haystack = `${c.label} ${c.provenance.rawText}`;
    for (const { pattern, reason } of INAPPROPRIATE_CRITERION_PATTERNS) {
      if (pattern.test(haystack)) {
        warnings.push({ candidateId: c.id, label: c.label, reason });
        break;
      }
    }
  }
  return warnings;
}
