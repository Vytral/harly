import "server-only";

import { Output, generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import { interviewBriefSchema, type InterviewBrief } from "@/lib/ai/schemas";
import type { AiModelConfig } from "@/lib/ai/providers";

export type InterviewBriefInput = {
  candidate: {
    fullName: string;
    headline: string | null;
    location: string | null;
    skills: string[];
    experienceYears: number | null;
    resumeText: string | null;
  };
  job: {
    title: string;
    description: string;
    requirements: string | null;
    keywords: string[];
  };
  interview: {
    type: string;
    scheduledAt: Date;
    interviewerName: string | null;
  };
  existingScore: {
    score: number;
    gaps: string[];
    criteria: Array<{ label: string; score: number; evidence: string | null }>;
  } | null;
};

const SYSTEM_PROMPT =
  "You are a senior recruiting partner preparing an interviewer for a candidate meeting. " +
  "Generate a concise, actionable interview brief. " +
  "`candidateSummary` is 2-3 sentences covering background and fit signal. " +
  "`keyAreasToProbe` are 3-5 specific areas where evidence is missing or weak — not generic topics. " +
  "`suggestedQuestions` are 4-6 concrete, behavioral or technical questions tailored to the role and candidate profile. " +
  "`redFlags` are 0-3 specific things to watch for — omit if nothing stands out. " +
  "Be direct and specific. Avoid filler.";

export async function generateInterviewBriefWithAI(
  config: AiModelConfig,
  input: InterviewBriefInput,
): Promise<InterviewBrief> {
  const { candidate, job, interview, existingScore } = input;

  const candidateBlock = [
    `Name: ${candidate.fullName}`,
    candidate.headline ? `Headline: ${candidate.headline}` : null,
    candidate.location ? `Location: ${candidate.location}` : null,
    candidate.experienceYears != null ? `Experience: ${candidate.experienceYears} years` : null,
    candidate.skills.length > 0 ? `Skills: ${candidate.skills.slice(0, 20).join(", ")}` : null,
    candidate.resumeText
      ? `Resume:\n"""\n${candidate.resumeText.slice(0, 8000)}\n"""`
      : "Resume: not available",
  ]
    .filter(Boolean)
    .join("\n");

  const jobBlock = [
    `Title: ${job.title}`,
    job.keywords.length > 0 ? `Keywords: ${job.keywords.join(", ")}` : null,
    `Description: ${job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000)}`,
    job.requirements
      ? `Requirements: ${job.requirements.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const interviewBlock = [
    `Interview type: ${interview.type}`,
    interview.interviewerName ? `Interviewer: ${interview.interviewerName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const scoreBlock = existingScore
    ? `AI fit score: ${existingScore.score}/100\n` +
      (existingScore.gaps.length > 0 ? `Known gaps: ${existingScore.gaps.join("; ")}\n` : "") +
      (existingScore.criteria.length > 0
        ? `Criteria: ${existingScore.criteria
            .map((c) => `${c.label}: ${c.score}${c.evidence ? ` (${c.evidence})` : ""}`)
            .join("; ")}`
        : "")
    : "No AI score available yet.";

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Generate an interview brief.\n\n## Candidate\n${candidateBlock}\n\n## Job\n${jobBlock}\n\n## Interview\n${interviewBlock}\n\n## Existing AI Score\n${scoreBlock}`,
    output: Output.object({ schema: interviewBriefSchema }),
  });

  if (!output) throw new Error("AI returned no interview brief.");

  return {
    ...output,
    keyAreasToProbe: output.keyAreasToProbe.slice(0, 5),
    suggestedQuestions: output.suggestedQuestions.slice(0, 6),
    redFlags: output.redFlags.slice(0, 3),
  };
}
