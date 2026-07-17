import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { recordAiUsage } from "@/lib/ai/usage";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import {
  scorecardRefinementSchema,
  type ScorecardRefinement,
} from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type ScorecardRefinementInput = {
  /** The interviewer's raw scorecard comment. */
  comment: string;
  jobTitle?: string | null;
};

const SYSTEM_PROMPT =
  "You are an editor cleaning up an interviewer's scorecard comment. " +
  "Correct grammar and spelling, standardize formatting, and improve clarity and flow. " +
  "Preserve the author's original meaning, judgement, and first-person voice exactly , " +
  "never add opinions, evidence, or conclusions they did not write, and never soften or " +
  "strengthen their assessment. Do not invent specifics. Keep it concise. " +
  "Return plain text only (no markdown headings), using blank lines between paragraphs. " +
  "\n\n" +
  UNTRUSTED_DATA_GUARDRAIL;

export async function refineScorecardTextWithAI(
  config: AiModelConfig,
  input: ScorecardRefinementInput,
): Promise<ScorecardRefinement> {
  const result = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt:
      (input.jobTitle ? `Role: ${input.jobTitle}\n\n` : "") +
      `Refine this interviewer comment:\n"""\n${input.comment.slice(0, 6000)}\n"""`,
    output: Output.object({
      schema: scorecardRefinementSchema,
      name: "scorecard_refinement",
      description:
        "The same interviewer comment with grammar, formatting, and clarity improved.",
    }),
  });

  recordAiUsage({
    surface: "refine_scorecard",
    provider: config.provider,
    modelId: config.modelId,
    promptTokens: result.usage.inputTokens ?? 0,
    completionTokens: result.usage.outputTokens ?? 0,
  });

  const output = result.output;
  if (!output) throw new Error("AI returned no refined text.");

  return { refined: output.refined.trim() };
}
