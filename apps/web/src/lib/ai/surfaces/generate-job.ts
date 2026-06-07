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
};

const SYSTEM_PROMPT =
  "You are an expert technical recruiter who writes clear, inclusive, " +
  "scannable job descriptions. Avoid clichés, hype, and buzzwords. Keep " +
  "bullets concise and concrete. Do not invent specific salary figures or " +
  "company names.";

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

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Write a job description for the role below.\n\n${facts}\n\nReturn a short summary paragraph and 3-5 sections (for example: Responsibilities, Requirements, Nice to have, Benefits), each with 3-6 concise bullet points.`,
    output: Output.object({ schema: jobDraftSchema }),
  });

  if (!output) {
    throw new Error("AI returned no structured output for the job draft.");
  }

  return output;
}
