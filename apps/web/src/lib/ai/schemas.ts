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

/**
 * Rich, structured résumé extraction for the candidate profile — summary, skills,
 * total years, plus a work-experience timeline and education list. One AI call
 * fills every parsed field on `candidateFiles`.
 */
export const resumeStructuredSchema = z.object({
  // 2-4 sentence professional summary in the candidate's own framing. Null if absent.
  summary: z.string().nullable(),
  // Concise, deduplicated skill/technology names.
  skills: z.array(z.string()),
  // Total years of professional experience, rounded. Null if not derivable.
  experienceYears: z.number().nullable(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      // Human-readable range as written on the résumé, e.g. "2023 - 2025" or "2020 - Present".
      dateRange: z.string().nullable(),
      // Achievement/responsibility bullets, verbatim-ish, no leading markers.
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      dateRange: z.string().nullable(),
    }),
  ),
});

export type ResumeStructured = z.infer<typeof resumeStructuredSchema>;

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

export const interviewBriefSchema = z.object({
  candidateSummary: z.string(),
  keyAreasToProbe: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
  redFlags: z.array(z.string()),
});

export type InterviewBrief = z.infer<typeof interviewBriefSchema>;

export const interviewNotesSummarySchema = z.object({
  executiveSummary: z.string(),
  positiveSignals: z.array(z.string()),
  concerns: z.array(z.string()),
  suggestedDecision: z.enum(["strong_yes", "yes", "maybe", "no"]),
});

export type InterviewNotesSummary = z.infer<typeof interviewNotesSummarySchema>;

export const duplicateCandidateSchema = z.object({
  matches: z.array(
    z.object({
      candidateId: z.string(),
      confidence: z.enum(["high", "medium"]),
      reason: z.string(),
    }),
  ),
});

export type DuplicateCandidateResult = z.infer<typeof duplicateCandidateSchema>;
