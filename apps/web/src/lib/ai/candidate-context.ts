/**
 * The one place that turns candidate data into AI prompt context.
 *
 * Every AI surface that sends candidate data to a provider builds its candidate
 * block through `buildCandidateAiContext`. With anonymization on (the workspace
 * `aiResumeAnonymization` setting, carried on the AI config as
 * `resumeAnonymization`) the result contains no name, no contact details, no
 * links, no location and no photo, and every free-text field has identity
 * signals removed. Surfaces that cannot work without identity call
 * `assertAnonymizationAllows` and refuse with a user-facing message instead.
 *
 * Pure module: no server-only or database imports, so it is unit-testable.
 */

import {
  redactText,
  type CandidateIdentity,
} from "@/features/candidates/anonymize";

/** Stable alias used in place of the candidate's name in model prompts. */
export const ANONYMIZED_CANDIDATE_LABEL = "Candidate";

/** The workspace setting as a surface sees it. Absent means off. */
export type AnonymizationSettings = {
  resumeAnonymization?: boolean;
};

export type CandidateAiSource = CandidateIdentity & {
  headline?: string | null;
  location?: string | null;
  skills?: readonly string[] | null;
  experienceYears?: number | null;
  resumeText?: string | null;
  answers?: ReadonlyArray<{ question: string; answer: string }> | null;
};

export type CandidateAiContext = {
  /** Name as it may appear in the prompt: the real name, or the alias when anonymized. */
  label: string;
  /** Identity used to redact other free text (interview notes, comments). */
  identity: CandidateIdentity;
  anonymized: boolean;
  headline: string | null;
  location: string | null;
  skills: string[];
  experienceYears: number | null;
  resumeText: string | null;
  answers: Array<{ question: string; answer: string }>;
};

/** Fill in first/last name from the full name (or the other way round) when missing. */
export function resolveCandidateIdentity(source: CandidateIdentity): CandidateIdentity {
  const parts = (source.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = source.firstName?.trim() || parts[0] || null;
  const lastName =
    source.lastName?.trim() || (parts.length > 1 ? parts[parts.length - 1] : null) || null;
  const fullName =
    source.fullName?.trim() || [firstName, lastName].filter(Boolean).join(" ") || null;
  return { firstName, lastName, fullName };
}

export function buildCandidateAiContext(
  source: CandidateAiSource,
  options: { anonymize: boolean },
): CandidateAiContext {
  const identity = resolveCandidateIdentity(source);
  const skills = [...(source.skills ?? [])];
  const answers = [...(source.answers ?? [])];

  if (!options.anonymize) {
    return {
      label: identity.fullName ?? ANONYMIZED_CANDIDATE_LABEL,
      identity,
      anonymized: false,
      headline: source.headline ?? null,
      location: source.location ?? null,
      skills,
      experienceYears: source.experienceYears ?? null,
      resumeText: source.resumeText ?? null,
      answers: answers.map((answer) => ({ ...answer })),
    };
  }

  const redact = (value: string | null | undefined) => redactText(value, identity);
  return {
    label: ANONYMIZED_CANDIDATE_LABEL,
    identity,
    anonymized: true,
    headline: redact(source.headline),
    // A city or region narrows a candidate down; it is not needed to judge fit.
    location: null,
    skills: skills
      .map((skill) => redact(skill) ?? "")
      .filter((skill) => skill.trim().length > 0),
    experienceYears: source.experienceYears ?? null,
    resumeText: redact(source.resumeText),
    answers: answers.map((answer) => ({
      question: redact(answer.question) ?? "",
      answer: redact(answer.answer) ?? "",
    })),
  };
}

/**
 * Redact a piece of free text that a surface sends alongside candidate data
 * (interview notes, a scorecard comment, model output). A no-op when off.
 */
export function redactForAi(
  text: string,
  identity: CandidateIdentity,
  anonymize: boolean,
): string {
  if (!anonymize) return text;
  return redactText(text, identity) ?? "";
}

/** Thrown when a feature cannot run without identity while anonymization is on. */
export class AiAnonymizationBlockedError extends Error {
  readonly code = "anonymization_blocked";

  constructor(message: string) {
    super(message);
    this.name = "AiAnonymizationBlockedError";
  }
}

export function isAiAnonymizationBlockedError(
  error: unknown,
): error is AiAnonymizationBlockedError {
  return error instanceof AiAnonymizationBlockedError;
}

/** User-facing reasons a feature is paused while anonymization is on. */
export const ANONYMIZATION_BLOCKED_MESSAGES = {
  duplicateDetection:
    "Duplicate detection is paused while candidate anonymization is on, because it compares names and email addresses. Turn anonymization off in AI settings to run it.",
  emailDraft:
    "Email drafting is paused while candidate anonymization is on, because drafts are addressed to a named candidate. Turn anonymization off in AI settings to draft with AI.",
  mailboxAssistance:
    "Mailbox AI assistance is paused while candidate anonymization is on, because email threads identify the candidate. Turn anonymization off in AI settings to use it.",
  resumeAutofill:
    "AI resume autofill is paused while candidate anonymization is on, because it reads the applicant's name and contact details. The standard parser fills the form instead.",
  resumeProfile:
    "AI resume summaries are paused while candidate anonymization is on, because the resume name cannot be removed without knowing it. Upload again with the candidate's name, or turn anonymization off in AI settings.",
  scorecardRefinement:
    "Scorecard comment refinement is paused while candidate anonymization is on, because comments can name the candidate. Turn anonymization off in AI settings to refine comments with AI.",
} as const;

/** Throw when anonymization is on and the feature cannot run without identity. */
export function assertAnonymizationAllows(
  settings: AnonymizationSettings,
  userMessage: string,
): void {
  if (settings.resumeAnonymization === true) {
    throw new AiAnonymizationBlockedError(userMessage);
  }
}
