import { z } from "zod";

const provenanceSchema = z.object({
  sourceType: z.enum(["resume", "job_description", "application_qa", "candidate_profile"]),
  section: z.enum(["experience", "education", "skills", "summary", "certifications", "languages", "header", "other"]).optional(),
  rawText: z.string().max(20_000),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
  lineIndex: z.number().int().nonnegative().optional(),
  blockId: z.string().max(200).optional(),
  pageNumber: z.number().int().positive().optional(),
});

export const evaluationCriterionInputSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9:_-]*$/i),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["skill", "experience_years", "education"]),
  importance: z.enum(["required", "preferred"]),
  weight: z.number().int().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20),
  sourceProvenance: provenanceSchema.optional(),
  minimumValue: z.number().int().min(0).max(50).nullable().optional(),
  /** Explicit education degree rank 1–5 (C2). When set on education criteria, overrides minimumValue-as-rank. */
  minimumEducationLevelRank: z.number().int().min(0).max(5).nullable().optional(),
  // Phase 2 governance (§2.3, §3.4): gates are recruiter-only and explicit.
  // Knockout requires required importance; excluded forces required +
  // knockout semantics (normalized in the action, mirroring applyRecruiterDecision).
  isKnockout: z.boolean().default(false),
  excluded: z.boolean().default(false),
});

export const evaluationRubricInputSchema = z.object({
  jobId: z.uuid(),
  criteria: z.array(evaluationCriterionInputSchema).min(1).max(50),
});

export type EvaluationCriterionInput = z.infer<typeof evaluationCriterionInputSchema>;
export type EvaluationRubricInput = z.infer<typeof evaluationRubricInputSchema>;

export interface EffectiveRubricCriterion {
  key: string;
  label: string;
  type: EvaluationCriterionInput["type"];
  importance: EvaluationCriterionInput["importance"];
  weight: number;
  aliases: string[];
  sourceProvenance?: z.infer<typeof provenanceSchema>;
  minimumValue: number | null;
  minimumEducationLevelRank: number | null;
  isKnockout: boolean;
  excluded: boolean;
}

/**
 * Phase 2 governance (§2.3): a knockout without required importance is a
 * caller error. Returns an error message, or null when gates are valid.
 * Rejects explicitly rather than silently coercing so recruiters see why.
 */
export function validateRubricGates(criteria: EvaluationCriterionInput[]): string | null {
  const invalid = criteria.find(
    (criterion) => !criterion.excluded && criterion.isKnockout && criterion.importance !== "required",
  );
  return invalid ? `Knockout requires required importance ("${invalid.key}").` : null;
}

/**
 * Maps validated input to effective persistence semantics, mirroring the
 * engine (criteria-builder rubric path, §3.4): an excluded constraint forces
 * required importance + knockout.
 */
export function toEffectiveCriterion(criterion: EvaluationCriterionInput): EffectiveRubricCriterion {
  const excluded = criterion.excluded;
  // C2: education rank may arrive as minimumEducationLevelRank or minimumValue.
  // Fold into minimumValue so the existing DB column carries the rank — no migration.
  const educationRank =
    criterion.type === "education"
      ? (criterion.minimumEducationLevelRank ?? criterion.minimumValue ?? null)
      : null;
  return {
    key: criterion.key,
    label: criterion.label,
    type: criterion.type,
    importance: excluded ? "required" : criterion.importance,
    weight: criterion.weight,
    aliases: criterion.aliases,
    sourceProvenance: criterion.sourceProvenance,
    minimumValue: criterion.type === "education" ? educationRank : (criterion.minimumValue ?? null),
    minimumEducationLevelRank: educationRank,
    isKnockout: excluded || criterion.isKnockout,
    excluded,
  };
}
