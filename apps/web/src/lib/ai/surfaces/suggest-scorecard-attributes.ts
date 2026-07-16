import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { recordAiUsage } from "@/lib/ai/usage";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import {
  scorecardAttributeSuggestionsSchema,
  type ScorecardAttributeSuggestions,
} from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type ScorecardAttributesInput = {
  jobTitle: string;
  description?: string | null;
  requirements?: string | null;
  /** Attribute labels the interviewer has already picked, to avoid duplicates. */
  existingAttributes?: string[];
};

const SYSTEM_PROMPT =
  "You are a senior recruiter defining a structured interview scorecard. " +
  "Propose 4-6 distinct, role-specific evaluation attributes an interviewer should rate. " +
  "Each attribute is a short noun phrase (e.g. 'System design', 'Stakeholder communication'). " +
  "`whatGoodLooksLike` is one concrete sentence describing a strong signal for THIS role. " +
  "Avoid generic filler like 'Culture fit' or 'Team player'. Do not repeat attributes the " +
  "interviewer already has. " +
  "\n\n" +
  UNTRUSTED_DATA_GUARDRAIL;

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function suggestScorecardAttributesWithAI(
  config: AiModelConfig,
  input: ScorecardAttributesInput,
): Promise<ScorecardAttributeSuggestions["attributes"]> {
  const facts = [
    `Role: ${input.jobTitle}`,
    input.existingAttributes && input.existingAttributes.length > 0
      ? `Already covered (do not repeat): ${input.existingAttributes.join(", ")}`
      : null,
    input.description
      ? `Description excerpt: ${stripHtml(input.description).slice(0, 900)}`
      : null,
    input.requirements
      ? `Requirements excerpt: ${stripHtml(input.requirements).slice(0, 700)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Suggest scorecard attributes for this role:\n\n${facts}`,
    output: Output.object({
      schema: scorecardAttributeSuggestionsSchema,
      name: "scorecard_attributes",
      description: "Role-specific interview scorecard evaluation attributes.",
    }),
  });

  recordAiUsage({
    surface: "suggest_scorecard_attributes",
    provider: config.provider,
    modelId: config.modelId,
    promptTokens: result.usage.inputTokens ?? 0,
    completionTokens: result.usage.outputTokens ?? 0,
  });

  const output = result.output;
  if (!output) throw new Error("AI returned no attributes.");

  return output.attributes.slice(0, 6);
}
