import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiModelConfig } from "@/lib/ai/providers";
import { ANONYMIZATION_BLOCKED_MESSAGES, AiAnonymizationBlockedError } from "@/lib/ai/candidate-context";

vi.mock("ai", () => ({
  Output: { object: (value: unknown) => value },
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
import { summarizeInterviewNotesWithAI } from "./summarize-interview-notes";
import { generateInterviewBriefWithAI } from "./generate-interview-brief";
import { parseResumeStructured, parseResumeWithAI } from "./parse-resume";
import { refineScorecardTextWithAI } from "./refine-scorecard";
import { detectDuplicatesWithAI } from "./detect-duplicates";
import { draftEmailWithAI } from "./draft-email";
import { generateMailboxReplyWithAI, generateMailboxSummaryWithAI } from "./mailbox-assistance";

const ON = { provider: "openai", modelId: "gpt-4o", apiKey: "sk-test", resumeAnonymization: true } as const;
const OFF = { provider: "openai", modelId: "gpt-4o", apiKey: "sk-test", resumeAnonymization: false } as const;
const plain: AiModelConfig = { provider: "openai", modelId: "gpt-4o", apiKey: "sk-test" };

const usage = { inputTokens: 1, outputTokens: 1 };

/** Identity strings that must never reach a provider when anonymization is on. */
const IDENTITY_STRINGS = [
  "Ada Lovelace",
  "Lovelace",
  "Ada",
  "ada@labs.example",
  "ada@example.com",
  "+44 20 7946 0958",
  "linkedin.com/in/ada-lovelace",
  "221B Baker Street",
  "Lisbon",
];

const RESUME = [
  "Ada Lovelace",
  "ada@example.com | +44 20 7946 0958",
  "linkedin.com/in/ada-lovelace",
  "221B Baker Street, London",
  "Analyst at Analytical Engines, 2019-2021. Built the first algorithm for Ada's engine.",
].join("\n");

function sentPrompt(): string {
  const call = vi.mocked(generateText).mock.calls.at(-1)?.[0] as { prompt?: string; system?: string } | undefined;
  return `${call?.system ?? ""}\n${call?.prompt ?? ""}`;
}

function expectNoIdentity(prompt: string) {
  for (const identity of IDENTITY_STRINGS) {
    expect(prompt, `prompt leaked "${identity}"`).not.toContain(identity);
  }
}

const scoreOutput = {
  score: 80,
  summary: "Good fit.",
  criteria: [{ dimension: "Analytics", score: 80, evidence: "Built the first algorithm" }],
  strengths: ["Analytics"],
  gaps: [],
};

const scoreInput = {
  job: {
    title: "Analyst",
    description: "Analyse data.",
    requirements: null,
    sector: null,
    experienceLevel: null,
    education: null,
    keywords: [],
  },
  candidate: {
    fullName: "Ada Lovelace",
    headline: "Analyst, ada@labs.example",
    location: "Lisbon",
    resumeText: RESUME,
    answers: [{ question: "Why us?", answer: "Ada Lovelace: I want to help. Mail ada@example.com." }],
    skills: ["Analysis"],
    experienceYears: 7,
  },
};

beforeEach(() => {
  vi.mocked(generateText).mockReset();
});

describe("score-candidate prompt", () => {
  it("sends no identity when anonymization is on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: scoreOutput, usage } as never);
    await scoreCandidateWithAI(ON, scoreInput);
    const prompt = sentPrompt();
    expectNoIdentity(prompt);
    expect(prompt).toContain("Name: Candidate");
    expect(prompt).toContain("Analysis");
    expect(prompt).toContain("Built the first algorithm");
  });

  it("still sends the real name and contacts when anonymization is off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: scoreOutput, usage } as never);
    await scoreCandidateWithAI(OFF, scoreInput);
    const prompt = sentPrompt();
    expect(prompt).toContain("Name: Ada Lovelace");
    expect(prompt).toContain("ada@example.com");
    expect(prompt).toContain("Lisbon");
  });

  it("treats a config without the setting as anonymization off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: scoreOutput, usage } as never);
    await scoreCandidateWithAI(plain, scoreInput);
    expect(sentPrompt()).toContain("Name: Ada Lovelace");
  });
});

describe("summarize-interview-notes prompt", () => {
  const notes = "Ada Lovelace was sharp. Ask Ada about ada@example.com availability. Strong on SQL.";
  const summary = {
    executiveSummary: "Strong.",
    positiveSignals: ["SQL"],
    concerns: [],
    suggestedDecision: "yes",
  };

  it("removes the candidate's name and contacts from the notes when on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: summary, usage } as never);
    await summarizeInterviewNotesWithAI(ON, {
      rawNotes: notes,
      candidateName: "Ada Lovelace",
      jobTitle: "Analyst",
      interviewType: "Screen",
    });
    const prompt = sentPrompt();
    expectNoIdentity(prompt);
    expect(prompt).toContain("Strong on SQL");
  });

  it("keeps the notes intact when off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: summary, usage } as never);
    await summarizeInterviewNotesWithAI(OFF, {
      rawNotes: notes,
      candidateName: "Ada Lovelace",
      jobTitle: "Analyst",
      interviewType: "Screen",
    });
    expect(sentPrompt()).toContain("Ask Ada about ada@example.com");
  });
});

describe("generate-interview-brief prompt", () => {
  const brief = {
    candidateSummary: "Summary.",
    keyAreasToProbe: [],
    suggestedQuestions: [],
    redFlags: [],
  };
  const input = {
    candidate: {
      fullName: "Ada Lovelace",
      headline: "Analyst, ada@labs.example",
      location: "Lisbon",
      skills: ["SQL"],
      experienceYears: 7,
      resumeText: RESUME,
    },
    job: { title: "Analyst", description: "Analyse data.", requirements: null, keywords: [] },
    interview: { type: "screen", scheduledAt: new Date("2026-01-01T10:00:00Z"), interviewerName: "Charles" },
    existingScore: {
      score: 70,
      gaps: ["Ada Lovelace has no Python evidence"],
      criteria: [{ label: "SQL", score: 70, evidence: "Ada Lovelace wrote SQL at ada@example.com" }],
    },
  };

  it("sends no candidate identity when anonymization is on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: brief, usage } as never);
    await generateInterviewBriefWithAI(ON, input);
    const prompt = sentPrompt();
    expectNoIdentity(prompt);
    expect(prompt).toContain("Name: Candidate");
    expect(prompt).toContain("no Python evidence");
  });

  it("keeps identity when anonymization is off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: brief, usage } as never);
    await generateInterviewBriefWithAI(OFF, input);
    expect(sentPrompt()).toContain("Name: Ada Lovelace");
  });

  const withNotes = {
    ...input,
    interview: {
      ...input.interview,
      durationMins: 45,
      notes: "Ada Lovelace mentioned ada@example.com and asked about the Analytical Engine.",
    },
    existingScore: null,
  };

  it("redacts the candidate from interviewer notes when anonymization is on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: brief, usage } as never);
    await generateInterviewBriefWithAI(ON, withNotes);
    const prompt = sentPrompt();
    expectNoIdentity(prompt);
    expect(prompt).toContain("Interviewer notes:");
    expect(prompt).toContain("Duration: 45 min");
    expect(prompt).toContain("Analytical Engine");
  });

  it("keeps the notes verbatim when anonymization is off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: brief, usage } as never);
    await generateInterviewBriefWithAI(OFF, withNotes);
    expect(sentPrompt()).toContain("Interviewer notes: Ada Lovelace mentioned ada@example.com");
  });

  it("omits the score section when no score is passed", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: brief, usage } as never);
    await generateInterviewBriefWithAI(ON, withNotes);
    expect(sentPrompt()).not.toContain("Existing AI Score");
    expect(sentPrompt()).not.toContain("No AI score available yet.");
  });
});

describe("parse-resume prompts", () => {
  const structured = {
    summary: "Analyst.",
    skills: ["SQL"],
    experienceYears: 7,
    experience: [],
    education: [],
  };

  it("parses a profile with the candidate's name removed when on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: structured, usage } as never);
    await parseResumeStructured(ON, RESUME, { identity: { fullName: "Ada Lovelace" } });
    const prompt = sentPrompt();
    expectNoIdentity(prompt);
    expect(prompt).toContain("Analytical Engines");
  });

  it("refuses to parse a profile when anonymization is on and the name is unknown", async () => {
    await expect(parseResumeStructured(ON, RESUME)).rejects.toThrow(
      ANONYMIZATION_BLOCKED_MESSAGES.resumeProfile,
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("parses a profile unchanged when anonymization is off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: structured, usage } as never);
    await parseResumeStructured(OFF, RESUME);
    expect(sentPrompt()).toContain("ada@example.com");
  });

  it("refuses resume autofill when anonymization is on, so the heuristic runs instead", async () => {
    await expect(parseResumeWithAI(ON, RESUME)).rejects.toBeInstanceOf(AiAnonymizationBlockedError);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("refine-scorecard prompt", () => {
  const comment = "Ada Lovelace explained the trade-offs clearly. Reach her at ada@example.com.";

  it("removes the candidate's identity from the comment when on", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { refined: "ok" }, usage } as never);
    await refineScorecardTextWithAI(ON, {
      comment,
      candidate: { fullName: "Ada Lovelace" },
    });
    const prompt = sentPrompt();
    expect(prompt).not.toContain("Ada Lovelace");
    expect(prompt).not.toContain("ada@example.com");
    expect(prompt).toContain("explained the trade-offs clearly");
  });

  it("refuses refinement when on and the candidate is not supplied", async () => {
    await expect(refineScorecardTextWithAI(ON, { comment })).rejects.toThrow(
      ANONYMIZATION_BLOCKED_MESSAGES.scorecardRefinement,
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refines the comment unchanged when off", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { refined: "ok" }, usage } as never);
    await refineScorecardTextWithAI(OFF, { comment });
    expect(sentPrompt()).toContain("Ada Lovelace explained");
  });
});

describe("identity-dependent surfaces refuse when anonymization is on", () => {
  it("duplicate detection is not sent", async () => {
    await expect(
      detectDuplicatesWithAI(ON, {
        target: { candidateId: "c1", fullName: "Ada Lovelace", email: "ada@example.com", skills: [], headline: null },
        suspects: [{ candidateId: "c2", fullName: "Ada L.", email: "ada@example.com", skills: [], headline: null }],
      }),
    ).rejects.toThrow(ANONYMIZATION_BLOCKED_MESSAGES.duplicateDetection);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("email drafts are not sent", async () => {
    await expect(
      draftEmailWithAI(ON, {
        type: "screening",
        candidateName: "Ada Lovelace",
        jobTitle: "Analyst",
        companyName: "Harly",
      }),
    ).rejects.toThrow(ANONYMIZATION_BLOCKED_MESSAGES.emailDraft);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("mailbox summaries and replies are not sent", async () => {
    const thread = {
      subject: "Hi",
      participantEmail: "ada@example.com",
      messages: [
        {
          direction: "inbound" as const,
          fromEmail: "ada@example.com",
          toEmails: ["recruiter@harly.test"],
          body: "Hello",
          receivedAt: new Date(),
        },
      ],
    };
    await expect(generateMailboxSummaryWithAI(ON, thread)).rejects.toThrow(
      ANONYMIZATION_BLOCKED_MESSAGES.mailboxAssistance,
    );
    await expect(generateMailboxReplyWithAI(ON, thread)).rejects.toThrow(
      ANONYMIZATION_BLOCKED_MESSAGES.mailboxAssistance,
    );
    expect(generateText).not.toHaveBeenCalled();
  });
});
