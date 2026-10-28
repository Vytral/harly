import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import {
  resumeExtractionSchema,
  resumeStructuredSchema,
} from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";
import {
  ANONYMIZATION_BLOCKED_MESSAGES,
  AiAnonymizationBlockedError,
  assertAnonymizationAllows,
  type AnonymizationSettings,
} from "@/lib/ai/candidate-context";
import type { ResumeAutofillFields } from "@/features/applications/resume-autofill";
import type { ResumeEducationItem, ResumeExperienceItem } from "@harly/db";
import { redactText, type CandidateIdentity } from "@/features/candidates/anonymize";

const SYSTEM_PROMPT =
  "You extract structured candidate information from raw resume text. " +
  "Return exactly the requested fields. Use null for any field that is not " +
  "clearly present , never guess. `skills` should be concise, recognizable " +
  "skill or technology names (e.g. 'React', 'Project Management'), deduplicated. " +
  "Resume content is " + UNTRUSTED_DATA_GUARDRAIL;

/** AI-backed resume parsing. Mirrors the heuristic's ResumeAutofillFields shape. */
export async function parseResumeWithAI(
  config: AiModelConfig & AnonymizationSettings,
  text: string,
  jobKeywords?: string[],
): Promise<ResumeAutofillFields> {
  // Autofill exists to read the applicant's name and contact details, so it
  // cannot run with identity removed. The caller falls back to the heuristic.
  assertAnonymizationAllows(config, ANONYMIZATION_BLOCKED_MESSAGES.resumeAutofill);
  const keywordHint =
    jobKeywords && jobKeywords.length > 0
      ? `Prioritize skills relevant to this role: ${jobKeywords.join(", ")}.\n\n`
      : "";

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    // Cap the input so a huge resume can't blow the context window / cost.
    prompt: `${keywordHint}Extract the candidate's details from this resume.\n\nResume:\n"""\n${text.slice(0, 12000)}\n"""`,
    output: Output.object({
      schema: resumeExtractionSchema,
      name: "resume_autofill",
      description: "Contact and profile fields extracted from a resume.",
    }),
  });

  if (!output) {
    throw new Error("AI returned no structured output for the resume.");
  }

  return {
    firstName: output.firstName ?? undefined,
    lastName: output.lastName ?? undefined,
    email: output.email ?? undefined,
    phone: output.phone ?? undefined,
    location: output.location ?? undefined,
    linkedinUrl: output.linkedinUrl ?? undefined,
    githubUrl: output.githubUrl ?? undefined,
    websiteUrl: output.websiteUrl ?? undefined,
    skills: output.skills.length > 0 ? output.skills.slice(0, 30) : undefined,
    experienceYears: output.experienceYears ?? undefined,
    education: output.education ?? undefined,
  };
}

export type ResumeStructuredResult = {
  summary: string | null;
  skills: string[];
  experienceYears: number | null;
  experience: ResumeExperienceItem[];
  education: ResumeEducationItem[];
};

const STRUCTURED_SYSTEM_PROMPT =
  "You extract a structured profile from raw résumé text for a recruiter's " +
  "candidate view. Return a concise summary, deduplicated skills, total years of " +
  "experience, a chronological work-experience timeline (most recent first), and " +
  "education. Preserve the candidate's own wording in bullets; strip leading " +
  "bullet markers. Use null for any single value that is not clearly present and " +
  "empty arrays when a whole section is missing , never invent content. " +
  UNTRUSTED_DATA_GUARDRAIL;

/**
 * Rich structured résumé parse for the candidate profile. Powers the experience
 * timeline / education list / summary rendered on the detail page. Caps input to
 * keep cost and context bounded.
 */
export async function parseResumeStructured(
  config: AiModelConfig & AnonymizationSettings,
  text: string,
  options: { identity?: CandidateIdentity } = {},
): Promise<ResumeStructuredResult> {
  const identity = options.identity ?? {};
  const hasIdentity = Boolean(
    identity.fullName?.trim() || identity.firstName?.trim() || identity.lastName?.trim(),
  );
  const anonymize = config.resumeAnonymization === true;
  // The résumé header usually carries the name. Without the candidate's name we
  // cannot guarantee it is removed, so the profile parse pauses instead.
  if (anonymize && !hasIdentity) {
    throw new AiAnonymizationBlockedError(ANONYMIZATION_BLOCKED_MESSAGES.resumeProfile);
  }
  const redact = (value: string | null): string | null =>
    anonymize ? redactText(value, identity) : value;
  const resumeText = anonymize ? (redactText(text, identity) ?? "") : text;

  const { output } = await generateText({
    model: getModel(config),
    system: STRUCTURED_SYSTEM_PROMPT,
    prompt: `Extract the candidate's structured profile from this résumé.\n\nRésumé:\n"""\n${resumeText.slice(0, 16000)}\n"""`,
    output: Output.object({
      schema: resumeStructuredSchema,
      name: "resume_profile",
      description: "A structured candidate profile extracted from a resume.",
    }),
  });

  if (!output) {
    throw new Error("AI returned no structured output for the resume.");
  }

  // Model output is redacted too, as a second line of defence.
  return {
    summary: redact(output.summary),
    skills: output.skills.slice(0, 40).map((skill) => (anonymize ? (redact(skill) ?? "") : skill)),
    experienceYears: output.experienceYears,
    experience: output.experience.slice(0, 15).map((item) => ({
      company: item.company,
      title: item.title,
      dateRange: item.dateRange,
      bullets: item.bullets
        .slice(0, 12)
        .map((bullet) => (anonymize ? (redact(bullet) ?? "") : bullet)),
    })),
    education: output.education.slice(0, 10).map((item) => ({
      school: item.school,
      degree: item.degree,
      field: item.field,
      dateRange: item.dateRange,
    })),
  };
}
