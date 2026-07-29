import { z } from "zod";

export const evaluationCriterionInputSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9:_-]*$/i),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["skill", "experience_years", "education"]),
  importance: z.enum(["required", "preferred"]),
  weight: z.number().int().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20),
  minimumValue: z.number().int().min(0).max(50).nullable().optional(),
});

export const evaluationRubricInputSchema = z.object({
  jobId: z.uuid(),
  criteria: z.array(evaluationCriterionInputSchema).min(1).max(50),
});

export type EvaluationCriterionInput = z.infer<typeof evaluationCriterionInputSchema>;
export type EvaluationRubricInput = z.infer<typeof evaluationRubricInputSchema>;
