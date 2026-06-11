import { z } from "zod";

/**
 * Structured-output schemas for AI surfaces. Fields use `.nullable()` (not
 * `.optional()`) because OpenAI structured output requires every property to be
 * present — nullable is the supported way to express "unknown".
 */

export const resumeExtractionSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  skills: z.array(z.string()),
  experienceYears: z.number().nullable(),
  education: z.string().nullable(),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

export const jobDraftSchema = z.object({
  // Short plain-text intro (no HTML) — formatted to safe HTML downstream.
  summary: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
});

export type JobDraft = z.infer<typeof jobDraftSchema>;

export const candidateScoreSchema = z.object({
  // Overall fit 0-100. Calibrated: 80+ exceptional fit, 60-79 solid, 40-59
  // partial, <40 weak.
  score: z.number(),
  recommendation: z.enum(["strong_yes", "yes", "maybe", "no"]),
  // 2-3 sentence plain-text verdict a recruiter can read at a glance.
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  criteria: z.array(
    z.object({
      label: z.string(),
      score: z.number(),
      evidence: z.string().nullable(),
    }),
  ),
});

export type CandidateScore = z.infer<typeof candidateScoreSchema>;
