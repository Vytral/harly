import "server-only";

import { NoObjectGeneratedError, Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { recordAiUsage } from "@/lib/ai/usage";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import { candidateScoreSchema, type CandidateScore } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";
import {
  buildCandidateAiContext,
  type AnonymizationSettings,
} from "@/lib/ai/candidate-context";
import type { EvaluationMode } from "@/lib/evaluation/mode";

const SYSTEM_PROMPT =
  "You are a rigorous recruiting analyst. Score how well a candidate fits a " +
  "specific job using ONLY the evidence provided , never invent experience. " +
  "Be conservative and willing to score low. This is an absolute fit score, not a " +
  "percentile: 85-100 exceptional, 70-84 good, 45-69 mixed or incomplete, " +
  "0-44 weak. A candidate cannot be exceptional when a required job criterion is " +
  "missing, contradicted, or unverifiable. Missing information is a gap and must " +
  "reduce the score; never average only the evidence that happens to exist. " +
  "`criteria` must contain 3-6 job-derived dimensions (including the most important " +
  "requirements), each scored 0-100 with a short exact evidence quote or null when " +
  "nothing supports it. `strengths` and `gaps` " +
  "are concise bullet phrases. `summary` is 2-3 plain sentences for a recruiter. " +
  "Include specific missing or unverified requirements in `gaps`. Use `strong_yes` " +
  "only for an exceptional fit with strong evidence across the job's core criteria; " +
  "use `maybe` or `no` when evidence is incomplete." + "\n\n" + UNTRUSTED_DATA_GUARDRAIL;

export type ScoreCandidateInput = {
  job: {
    title: string;
    description: string;
    requirements: string | null;
    sector: string | null;
    experienceLevel: string | null;
    education: string | null;
    keywords: string[];
    evaluationMode?: EvaluationMode;
  };
  candidate: {
    fullName: string;
    /** Optional split name; derived from `fullName` when omitted. */
    firstName?: string | null;
    lastName?: string | null;
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
  config: AiModelConfig & AnonymizationSettings,
  input: ScoreCandidateInput,
): Promise<CandidateScore> {
  const { job } = input;
  const mode = job.evaluationMode ?? "balanced";
  // Identity never reaches the prompt when anonymization is on: the name becomes
  // a stable alias, contact details and location are dropped, and resume and
  // answer text is redacted.
  const candidate = buildCandidateAiContext(input.candidate, {
    anonymize: config.resumeAnonymization === true,
  });

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
    `Name: ${candidate.label}`,
    candidate.headline ? `Headline: ${candidate.headline}` : null,
    candidate.location ? `Location: ${candidate.location}` : null,
    candidate.experienceYears != null
      ? `Experience: ${candidate.experienceYears} years`
      : null,
    candidate.skills.length > 0
      ? `Skills: ${candidate.skills.slice(0, 20).join(", ")}`
      : null,
    answersBlock ? `Application answers:\n${answersBlock}` : null,
    candidate.resumeText
      ? `Resume:\n"""\n${candidate.resumeText.slice(0, 12000)}\n"""`
      : "Resume: not available , score from profile and answers only, and say so in the summary.",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Score this candidate against this job using the ${mode} evaluation style.\n\nEvaluation style guidance:\n- relaxed: value transferable skills and reasonable trainability; a teachable gap should not automatically prevent a yes.\n- balanced: weigh direct evidence most heavily, but allow one or two teachable gaps for a yes.\n- strict: treat missing or unverified required criteria as blockers.\n\n## Job\n${jobBlock}\n\n## Candidate\n${candidateBlock}`;

  const recordUsage = (usage: { inputTokens?: number; outputTokens?: number } | undefined) =>
    recordAiUsage({
      surface: "score",
      provider: config.provider,
      modelId: config.modelId,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
    });

  // A model occasionally breaks the shape (seen: `strengths` sent as a string
  // holding half-escaped JSON). Salvage that answer when the content is
  // there, otherwise ask once more, before the caller falls back to rules.
  async function attempt(): Promise<CandidateScore> {
    try {
      const result = await generateText({
        model: getModel(config),
        system: SYSTEM_PROMPT,
        prompt,
        output: Output.object({
          schema: candidateScoreSchema,
          name: "candidate_fit_evaluation",
          description:
            "A calibrated candidate-to-job fit evaluation with evidence.",
        }),
      });
      recordUsage(result.usage);
      if (!result.output) {
        throw new Error("AI returned no structured output for the evaluation.");
      }
      return result.output;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      recordUsage(error.usage);
      const salvaged = salvageCandidateScore(error.text);
      if (salvaged) return salvaged;
      throw error;
    }
  }

  let output: CandidateScore;
  try {
    output = await attempt();
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    output = await attempt();
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const criteria = output.criteria.slice(0, 6).map((c) => ({
    ...c,
    score: clamp(c.score),
  }));
  const evidenceCoverage = criteria.length === 0
    ? 0
    : criteria.filter((criterion) => criterion.evidence?.trim()).length / criteria.length;
  const gapCount = output.gaps.filter((gap) => gap.trim()).length;
  const evidenceCap = evidenceCoverage < 0.5 ? 59 : evidenceCoverage < 0.8 ? 79 : 100;
  const calibratedScore = Math.min(clamp(output.score), evidenceCap);
  const thresholds = {
    relaxed: { strong: 85, yes: 65, coverageStrong: 60, coverageYes: 40, maxGapsStrong: 2, maxGapsYes: 4 },
    balanced: { strong: 85, yes: 70, coverageStrong: 80, coverageYes: 60, maxGapsStrong: 1, maxGapsYes: 3 },
    strict: { strong: 90, yes: 80, coverageStrong: 90, coverageYes: 80, maxGapsStrong: 0, maxGapsYes: 1 },
  }[mode];
  const recommendation =
    calibratedScore >= thresholds.strong && evidenceCoverage * 100 >= thresholds.coverageStrong && gapCount <= thresholds.maxGapsStrong
      ? "strong_yes"
      : calibratedScore >= thresholds.yes && evidenceCoverage * 100 >= thresholds.coverageYes && gapCount <= thresholds.maxGapsYes
        ? "yes"
        : calibratedScore >= 45
          ? "maybe"
          : "no";

  return {
    ...output,
    score: calibratedScore,
    recommendation,
    strengths: output.strengths.slice(0, 8),
    gaps: output.gaps.slice(0, 8),
    criteria,
  };
}

/** Quoted strings that are values, not object keys (`"x"` not followed by `:`). */
const QUOTED_VALUE_RE = /"((?:[^"\\]|\\.)*)"(?!\s*:)/g;

function coerceStringList(value: unknown): unknown {
  if (Array.isArray(value) || typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not valid JSON on its own; fall through to pulling out quoted items.
  }
  const items = Array.from(value.matchAll(QUOTED_VALUE_RE), (match) =>
    match[1].replace(/\\"/g, '"').trim(),
  ).filter(Boolean);
  if (items.length > 0) return items;
  return value
    .split(/\n|;/)
    .map((item) => item.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
}

/**
 * Recovers a usable evaluation from raw model text that failed the schema,
 * when the only problem is a list sent as a string. Returns null otherwise.
 */
export function salvageCandidateScore(text: string | undefined): CandidateScore | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const parsed = candidateScoreSchema.safeParse({
    ...record,
    strengths: coerceStringList(record.strengths),
    gaps: coerceStringList(record.gaps),
  });
  return parsed.success ? parsed.data : null;
}
