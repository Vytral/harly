import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { candidateScoreSchema, type CandidateScore } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

const SYSTEM_PROMPT =
  "You are a rigorous recruiting analyst. Score how well a candidate fits a " +
  "specific job using ONLY the evidence provided — never invent experience. " +
  "Be calibrated and willing to score low: 80-100 exceptional fit, 60-79 solid, " +
  "40-59 partial, 0-39 weak. `criteria` must contain 3-6 job-derived dimensions " +
  "(e.g. core skills, seniority, domain experience), each scored 0-100 with a " +
  "short evidence quote or null when nothing supports it. `strengths` and `gaps` " +
  "are concise bullet phrases. `summary` is 2-3 plain sentences for a recruiter. " +
  "Missing information is a gap, not a guess.";

export type ScoreCandidateInput = {
  job: {
    title: string;
    description: string;
    requirements: string | null;
    sector: string | null;
    experienceLevel: string | null;
    education: string | null;
    keywords: string[];
  };
  candidate: {
    fullName: string;
    headline: string | null;
    location: string | null;
    /** Plain text extracted from the latest resume, when available. */
    resumeText: string | null;
    /** Custom application question answers, when available. */
    answers: Array<{ question: string; answer: string }>;
    skills?: string[];
    experienceYears?: number | null;
  };
};

/** Strip HTML tags from rich-text job fields so the prompt stays compact. */
function plain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scoreCandidateWithAI(
  config: AiModelConfig,
  input: ScoreCandidateInput,
): Promise<CandidateScore> {
  const { job, candidate } = input;

  const jobBlock = [
    `Title: ${job.title}`,
    job.sector ? `Sector: ${job.sector}` : null,
    job.experienceLevel ? `Experience level: ${job.experienceLevel}` : null,
    job.education ? `Education: ${job.education}` : null,
    job.keywords.length > 0 ? `Keywords: ${job.keywords.join(", ")}` : null,
    `Description: ${plain(job.description).slice(0, 4000)}`,
    job.requirements
      ? `Requirements: ${plain(job.requirements).slice(0, 2000)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const answersBlock =
    candidate.answers.length > 0
      ? candidate.answers
          .map((a) => `Q: ${a.question}\nA: ${a.answer.slice(0, 600)}`)
          .join("\n")
      : null;

  const candidateBlock = [
    `Name: ${candidate.fullName}`,
    candidate.headline ? `Headline: ${candidate.headline}` : null,
    candidate.location ? `Location: ${candidate.location}` : null,
    candidate.experienceYears != null ? `Experience: ${candidate.experienceYears} years` : null,
    candidate.skills && candidate.skills.length > 0 ? `Skills: ${candidate.skills.slice(0, 20).join(", ")}` : null,
    answersBlock ? `Application answers:\n${answersBlock}` : null,
    candidate.resumeText
      ? `Resume:\n"""\n${candidate.resumeText.slice(0, 12000)}\n"""`
      : "Resume: not available — score from profile and answers only, and say so in the summary.",
  ]
    .filter(Boolean)
    .join("\n");

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Score this candidate against this job.\n\n## Job\n${jobBlock}\n\n## Candidate\n${candidateBlock}`,
    output: Output.object({ schema: candidateScoreSchema }),
  });

  if (!output) {
    throw new Error("AI returned no structured output for the evaluation.");
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  return {
    ...output,
    score: clamp(output.score),
    strengths: output.strengths.slice(0, 8),
    gaps: output.gaps.slice(0, 8),
    criteria: output.criteria.slice(0, 6).map((c) => ({
      ...c,
      score: clamp(c.score),
    })),
  };
}
