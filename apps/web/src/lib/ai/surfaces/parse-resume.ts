import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { resumeExtractionSchema } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";
import type { ResumeAutofillFields } from "@/features/applications/resume-autofill";

const SYSTEM_PROMPT =
  "You extract structured candidate information from raw resume text. " +
  "Return exactly the requested fields. Use null for any field that is not " +
  "clearly present — never guess. `skills` should be concise, recognizable " +
  "skill or technology names (e.g. 'React', 'Project Management'), deduplicated.";

/** AI-backed resume parsing. Mirrors the heuristic's ResumeAutofillFields shape. */
export async function parseResumeWithAI(
  config: AiModelConfig,
  text: string,
  jobKeywords?: string[],
): Promise<ResumeAutofillFields> {
  const keywordHint =
    jobKeywords && jobKeywords.length > 0
      ? `Prioritize skills relevant to this role: ${jobKeywords.join(", ")}.\n\n`
      : "";

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    // Cap the input so a huge resume can't blow the context window / cost.
    prompt: `${keywordHint}Extract the candidate's details from this resume.\n\nResume:\n"""\n${text.slice(0, 12000)}\n"""`,
    output: Output.object({ schema: resumeExtractionSchema }),
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
