import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { recordAiUsage } from "@/lib/ai/usage";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import {
  interviewNotesSummarySchema,
  type InterviewNotesSummary,
} from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type InterviewNotesSummaryInput = {
  rawNotes: string;
  candidateName: string;
  jobTitle: string;
  interviewType: string;
};

const SYSTEM_PROMPT =
  "You are a senior recruiter structuring raw interview notes into a clean debrief. " +
  "`executiveSummary` is 2-3 sentences: overall impression and key takeaway. " +
  "`positiveSignals` are concrete evidence points from the conversation (not generic praise). " +
  "`concerns` are specific gaps or risks observed (not generic warnings). " +
  "`suggestedDecision` is your calibrated recommendation based only on the notes provided. " +
  "Do not invent information. If notes are sparse, say so in the summary." + "\n\n" + UNTRUSTED_DATA_GUARDRAIL;

export async function summarizeInterviewNotesWithAI(
  config: AiModelConfig,
  input: InterviewNotesSummaryInput,
): Promise<InterviewNotesSummary> {
  const result = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt:
      `Structure these interview notes.\n\n` +
      `Candidate: ${input.candidateName}\n` +
      `Role: ${input.jobTitle}\n` +
      `Interview type: ${input.interviewType}\n\n` +
      `Notes:\n"""\n${input.rawNotes.slice(0, 8000)}\n"""`,
    output: Output.object({
      schema: interviewNotesSummarySchema,
      name: "interview_notes_summary",
      description:
        "A structured debrief derived strictly from interview notes.",
    }),
  });

  recordAiUsage({
    surface: "summarize_notes",
    provider: config.provider,
    modelId: config.modelId,
    promptTokens: result.usage.inputTokens ?? 0,
    completionTokens: result.usage.outputTokens ?? 0,
  });

  const output = result.output;
  if (!output) throw new Error("AI returned no interview summary.");

  return {
    ...output,
    positiveSignals: output.positiveSignals.slice(0, 8),
    concerns: output.concerns.slice(0, 8),
  };
}
