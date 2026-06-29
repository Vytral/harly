import "server-only";

import { generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import type { AiModelConfig } from "@/lib/ai/providers";

export type PipelineSummaryInput = {
  totalActive: number;
  stalledCandidates: number;
  stalledDays: number;
  unscored: number;
  byRecommendation: {
    strong_yes: number;
    yes: number;
    maybe: number;
    no: number;
  };
};

/**
 * Generate a one-sentence pipeline headline for the recruiter.
 * Returns null on failure — callers should degrade gracefully.
 */
export async function generatePipelineHeadlineWithAI(
  config: AiModelConfig,
  summary: PipelineSummaryInput,
): Promise<string | null> {
  const topFits = summary.byRecommendation.strong_yes + summary.byRecommendation.yes;
  const prompt = [
    `You are a concise recruiting assistant. Write a single plain-text sentence (no markdown, no bullet points) summarising the state of this hiring pipeline for a recruiter.`,
    ``,
    `Pipeline data:`,
    `- Active candidates: ${summary.totalActive}`,
    `- Strong yes / yes: ${topFits}`,
    `- Maybe: ${summary.byRecommendation.maybe}`,
    `- No: ${summary.byRecommendation.no}`,
    `- Unscored: ${summary.unscored}`,
    `- Stalled ${summary.stalledDays}+ days: ${summary.stalledCandidates}`,
    ``,
    `One sentence, actionable tone, max 20 words. No greeting.`,
  ].join("\n");

  try {
    const model = getModel(config);
    const { text } = await generateText({
      model,
      prompt,
      maxOutputTokens: 64,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    return cleaned || null;
  } catch {
    return null;
  }
}
