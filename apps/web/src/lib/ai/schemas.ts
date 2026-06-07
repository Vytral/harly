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
