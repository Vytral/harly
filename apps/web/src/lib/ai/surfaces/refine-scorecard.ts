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
import {
  ANONYMIZATION_BLOCKED_MESSAGES,
  AiAnonymizationBlockedError,
  redactForAi,
  type AnonymizationSettings,
} from "@/lib/ai/candidate-context";
import type { CandidateIdentity } from "@/features/candidates/anonymize";

export type ScorecardRefinementInput = {
  /** The interviewer's raw scorecard comment. */
  comment: string;
  jobTitle?: string | null;
  /**
   * The candidate the comment is about. Required when anonymization is on, so
   * that the candidate's name can be removed from the comment before it is sent.
   */
  candidate?: CandidateIdentity | null;
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
  config: AiModelConfig & AnonymizationSettings,
  input: ScorecardRefinementInput,
): Promise<ScorecardRefinement> {
  const anonymize = config.resumeAnonymization === true;
  const identity = input.candidate ?? null;
  const hasIdentity = Boolean(
    identity?.fullName?.trim() || identity?.firstName?.trim() || identity?.lastName?.trim(),
  );
  // Comments can name the candidate. Without the candidate's identity we cannot
  // guarantee the name is removed, so refinement pauses instead.
  if (anonymize && !hasIdentity) {
    throw new AiAnonymizationBlockedError(ANONYMIZATION_BLOCKED_MESSAGES.scorecardRefinement);
  }
  const comment = redactForAi(input.comment, identity ?? {}, anonymize);

  const result = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt:
      (input.jobTitle ? `Role: ${input.jobTitle}\n\n` : "") +
      `Refine this interviewer comment:\n"""\n${comment.slice(0, 6000)}\n"""`,
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
