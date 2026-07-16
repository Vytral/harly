import { describe, expect, it, vi } from "vitest";

import type { AiModelConfig } from "@/lib/ai/providers";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";

vi.mock("ai", () => ({
  Output: { object: (x: unknown) => x },
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/registry", () => ({
  getModel: () => ({ mock: true }),
}));

vi.mock("@/lib/ai/usage", () => ({
  recordAiUsage: vi.fn(),
}));

import { generateText } from "ai";

import { scoreCandidateWithAI } from "./score-candidate";
import { detectDuplicatesWithAI } from "./detect-duplicates";
import { summarizeInterviewNotesWithAI } from "./summarize-interview-notes";
import { refineScorecardTextWithAI } from "./refine-scorecard";
import { suggestScorecardAttributesWithAI } from "./suggest-scorecard-attributes";

const config: AiModelConfig = {
  provider: "openai",
  modelId: "gpt-4o",
  apiKey: "sk-test",
};

describe("AI surfaces (IA-07)", () => {
  it("scoreCandidateWithAI clamps the score and caps arrays", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        score: 250,
        summary: "Strong but unverified.",
        criteria: Array.from({ length: 10 }, (_, i) => ({
          dimension: `dim-${i}`,
          score: i * 25,
          evidence: null,
        })),
        strengths: Array.from({ length: 12 }, (_, i) => `s-${i}`),
        gaps: Array.from({ length: 12 }, (_, i) => `g-${i}`),
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    const result = await scoreCandidateWithAI(config, {
      job: { title: "Eng", description: "d", requirements: null, sector: null, experienceLevel: null, education: null, keywords: [] },
      candidate: { fullName: "A B", headline: null, location: null, resumeText: null, answers: [] },
    });

    expect(result.score).toBe(100);
    expect(result.criteria).toHaveLength(6);
    expect(result.criteria.every((c) => c.score <= 100)).toBe(true);
    expect(result.strengths).toHaveLength(8);
    expect(result.gaps).toHaveLength(8);
  });

  it("scoreCandidateWithAI throws when the model returns no output", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: undefined,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);
    await expect(
      scoreCandidateWithAI(config, {
        job: { title: "Eng", description: "d", requirements: null, sector: null, experienceLevel: null, education: null, keywords: [] },
        candidate: { fullName: "A B", headline: null, location: null, resumeText: null, answers: [] },
      }),
    ).rejects.toThrow(/no structured output/i);
  });

  it("detectDuplicatesWithAI returns the matched suspects", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        matches: [
          { candidateId: "suspect-1", confidence: "high", reason: "Same email" },
        ],
      },
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    const result = await detectDuplicatesWithAI(config, {
      target: { candidateId: "t", fullName: "T", email: "t@x.com", headline: null, skills: [] },
      suspects: [{ candidateId: "suspect-1", fullName: "S", email: "t@x.com", headline: null, skills: [] }],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.candidateId).toBe("suspect-1");
  });

  it("summarizeInterviewNotesWithAI caps positiveSignals/concerns to 8", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        executiveSummary: "Solid interview.",
        positiveSignals: Array.from({ length: 15 }, (_, i) => `p-${i}`),
        concerns: Array.from({ length: 15 }, (_, i) => `c-${i}`),
        suggestedDecision: "yes",
      },
      usage: { inputTokens: 12, outputTokens: 6, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    const result = await summarizeInterviewNotesWithAI(config, {
      rawNotes: "notes",
      candidateName: "A B",
      jobTitle: "Eng",
      interviewType: "Screen",
    });

    expect(result.positiveSignals).toHaveLength(8);
    expect(result.concerns).toHaveLength(8);
  });

  it("includes the untrusted-data guardrail in the system prompt (IA-14)", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { score: 50, summary: "ok", criteria: [], strengths: [], gaps: [] },
      usage: { inputTokens: 9, outputTokens: 2, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    await scoreCandidateWithAI(config, {
      job: { title: "Eng", description: "d", requirements: null, sector: null, experienceLevel: null, education: null, keywords: [] },
      candidate: { fullName: "A B", headline: null, location: null, resumeText: null, answers: [] },
    });

    const call = vi.mocked(generateText).mock.calls[0]?.[0] as { system?: string };
    expect(call?.system).toContain(UNTRUSTED_DATA_GUARDRAIL);
  });

  it("refineScorecardTextWithAI returns trimmed refined text", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { refined: "  Clear, corrected comment.  " },
      usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    const result = await refineScorecardTextWithAI(config, {
      comment: "clear corrected comment",
      jobTitle: "Eng",
    });

    expect(result.refined).toBe("Clear, corrected comment.");

    const call = vi.mocked(generateText).mock.calls[0]?.[0] as { system?: string };
    expect(call?.system).toContain(UNTRUSTED_DATA_GUARDRAIL);
  });

  it("suggestScorecardAttributesWithAI caps the list to 6", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        attributes: Array.from({ length: 10 }, (_, i) => ({
          label: `attr-${i}`,
          whatGoodLooksLike: `good-${i}`,
        })),
      },
      usage: { inputTokens: 9, outputTokens: 6, totalTokens: 15, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } },
    } as never);

    const result = await suggestScorecardAttributesWithAI(config, {
      jobTitle: "Eng",
      description: "d",
      requirements: null,
    });

    expect(result).toHaveLength(6);
    expect(result[0]?.label).toBe("attr-0");
  });
});
