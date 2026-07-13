import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { jobDraftSchema, type JobDraft } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type JobDraftInput = {
  title: string;
  department?: string;
  workplaceType?: string;
  keywords?: string[];
  brand?: {
    name: string;
    tagline?: string | null;
    description?: string | null;
    careerHeadline?: string | null;
    careerSubhead?: string | null;
    careerIntro?: string | null;
    values?: Array<{ title: string; body: string }>;
  };
};

const SYSTEM_PROMPT =
  "You are an expert technical recruiter who writes clear, inclusive, " +
  "scannable job descriptions. Avoid clichés, hype, and buzzwords. Keep " +
  "bullets concise and concrete. Do not invent specific salary figures or " +
  "company names. Reflect the supplied company identity, philosophy, values, " +
  "and voice when present; treat that context as factual brand guidance and " +
  "do not invent culture claims, benefits, or policies.";

/** AI-backed job-description draft: a summary + titled bullet sections. */
export async function generateJobDraftWithAI(
  config: AiModelConfig,
  input: JobDraftInput,
): Promise<JobDraft> {
  const facts = [
    `Title: ${input.title}`,
    input.department ? `Department: ${input.department}` : null,
    input.workplaceType ? `Workplace: ${input.workplaceType}` : null,
    input.keywords && input.keywords.length > 0
      ? `Key skills / keywords: ${input.keywords.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const brand = input.brand;
  const companyContext = brand
    ? [
        `Company: ${brand.name}`,
        brand.tagline ? `Tagline: ${brand.tagline}` : null,
        brand.description ? `Company description: ${brand.description}` : null,
        brand.careerHeadline
          ? `Careers headline: ${brand.careerHeadline}`
          : null,
        brand.careerSubhead ? `Careers subhead: ${brand.careerSubhead}` : null,
        brand.careerIntro
          ? `How the company describes itself: ${brand.careerIntro}`
          : null,
        brand.values && brand.values.length > 0
          ? `Values:\n${brand.values
              .slice(0, 8)
              .map((value) => `- ${value.title}: ${value.body}`)
              .join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "No company-specific brand context is available. Keep the language neutral and do not invent it.";

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Write a job description for the role below.\n\n## Role\n${facts}\n\n## Company identity and voice\n${companyContext}\n\nReturn a short summary paragraph and 3-5 sections (for example: Responsibilities, Requirements, Nice to have, Benefits), each with 3-6 concise bullet points. Only include Benefits when supported by the company context or role facts.`,
    output: Output.object({
      schema: jobDraftSchema,
      name: "job_description_draft",
      description: "A brand-aligned job summary with titled bullet sections.",
    }),
  });

  if (!output) {
    throw new Error("AI returned no structured output for the job draft.");
  }

  return output;
}
