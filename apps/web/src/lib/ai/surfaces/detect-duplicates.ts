import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { duplicateCandidateSchema, type DuplicateCandidateResult } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type DuplicateCheckInput = {
  target: {
    candidateId: string;
    fullName: string;
    email: string;
    skills: string[];
    headline: string | null;
  };
  suspects: Array<{
    candidateId: string;
    fullName: string;
    email: string;
    skills: string[];
    headline: string | null;
  }>;
};

const SYSTEM_PROMPT =
  "You are a data deduplication expert reviewing candidate profiles. " +
  "For each suspect candidate, determine if they are likely the same person as the target. " +
  "Return only matches with confidence 'high' (near-certain same person) or 'medium' (probable same person). " +
  "Omit suspects that are clearly different people. " +
  "`reason` should be a short phrase explaining the match signal (e.g. 'Same name and email domain', 'Identical skills and headline'). " +
  "Never guess — only return matches with real evidence.";

export async function detectDuplicatesWithAI(
  config: AiModelConfig,
  input: DuplicateCheckInput,
): Promise<DuplicateCandidateResult> {
  const targetBlock =
    `ID: ${input.target.candidateId}\n` +
    `Name: ${input.target.fullName}\n` +
    `Email: ${input.target.email}\n` +
    (input.target.headline ? `Headline: ${input.target.headline}\n` : "") +
    (input.target.skills.length > 0 ? `Skills: ${input.target.skills.slice(0, 15).join(", ")}\n` : "");

  const suspectsBlock = input.suspects
    .map(
      (s) =>
        `ID: ${s.candidateId}\n` +
        `Name: ${s.fullName}\n` +
        `Email: ${s.email}\n` +
        (s.headline ? `Headline: ${s.headline}\n` : "") +
        (s.skills.length > 0 ? `Skills: ${s.skills.slice(0, 15).join(", ")}\n` : ""),
    )
    .join("\n---\n");

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Check if any suspect is a duplicate of the target candidate.\n\n## Target\n${targetBlock}\n\n## Suspects\n${suspectsBlock}`,
    output: Output.object({ schema: duplicateCandidateSchema }),
  });

  if (!output) return { matches: [] };

  return { matches: output.matches.slice(0, 5) };
}
