import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCandidatePermission: vi.fn(),
  requireApplicationPermission: vi.fn(),
  getRolePolicy: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  enforceRateLimit: vi.fn(),
  loadResumeDocument: vi.fn(),
  findReusableCandidateFacts: vi.fn(),
  evaluateCandidateWithRulesAsync: vi.fn(),
  persistCandidateEvaluation: vi.fn(),
  scoreCandidateWithAI: vi.fn(),
  logAiCandidateDecision: vi.fn(),
  detectCandidateDuplicatesForWorkspace: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  notInArray: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, insert: mocks.insert },
  activityEvents: {},
  aiEvaluations: {},
  applicationAnswers: {},
  applicationQuestions: {},
  applications: {},
  candidates: {},
  jobs: {},
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  getRolePolicy: mocks.getRolePolicy,
  requireCandidatePermission: mocks.requireCandidatePermission,
  requirePermission: vi.fn(),
  requireApplicationPermission: mocks.requireApplicationPermission,
  requireJobPermission: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({
  getWorkspaceAiConfig: mocks.getWorkspaceAiConfig,
}));

vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/resume/load-resume-text", () => ({
  loadResumeText: vi.fn(),
  loadResumeDocument: mocks.loadResumeDocument,
}));

vi.mock("@/lib/ai/governance", () => ({
  logAiCandidateDecision: mocks.logAiCandidateDecision,
}));

vi.mock("@/lib/ai/surfaces/score-candidate", () => ({
  scoreCandidateWithAI: mocks.scoreCandidateWithAI,
}));

vi.mock("@/lib/evaluation/rules", () => ({
  evaluateCandidateWithRules: vi.fn(),
  evaluateCandidateWithRulesAsync: mocks.evaluateCandidateWithRulesAsync,
  RULES_EVALUATION_VERSION: "rules-v1",
}));

vi.mock("@/features/evaluations/service", () => ({
  getPublishedRulesRubric: vi.fn(),
  persistCandidateEvaluation: mocks.persistCandidateEvaluation,
  findReusableCandidateFacts: mocks.findReusableCandidateFacts,
}));

vi.mock("@/features/candidates/duplicate-detection", () => ({
  detectCandidateDuplicatesForWorkspace: mocks.detectCandidateDuplicatesForWorkspace,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { ANONYMIZATION_BLOCKED_MESSAGES } from "@/lib/ai/candidate-context";

import { detectCandidateDuplicatesAction, generateAiEvaluationAction } from "./ai-actions";

const WORKSPACE_ID = "workspace-1";
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";

function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => builder,
    orderBy: () => builder,
    then: (resolve: (value: unknown) => void) => resolve(rows),
  };
  return builder;
}

const APPLICATION_ROW = {
  applicationId: APPLICATION_ID,
  candidateId: CANDIDATE_ID,
  jobId: "22222222-2222-4222-8222-222222222222",
  firstName: "Ada",
  lastName: "Lovelace",
  headline: "Analyst, ada@labs.example",
  location: "Lisbon",
  skills: ["SQL"],
  experienceYears: 7,
  jobTitle: "Analyst",
  jobDescription: "Analyse data",
  jobRequirements: null,
  jobSector: null,
  jobExperienceLevel: null,
  jobEducation: null,
  jobKeywords: [],
  evaluationMode: "balanced",
  appliedAt: new Date("2026-01-01T00:00:00Z"),
  applicationCreatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCandidatePermission.mockResolvedValue({
    organization: { id: WORKSPACE_ID },
    user: { id: "recruiter-1", email: "r@example.com" },
    roleKey: "recruiter",
  });
  mocks.getRolePolicy.mockResolvedValue({
    scope: { jobAccess: "all", departments: [], regions: [] },
  });
  mocks.requireApplicationPermission.mockResolvedValue({
    organization: { id: WORKSPACE_ID },
    user: { id: "recruiter-1", email: "r@example.com" },
  });
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  mocks.loadResumeDocument.mockResolvedValue({ text: "resume", document: null });
  mocks.findReusableCandidateFacts.mockResolvedValue(null);
  mocks.evaluateCandidateWithRulesAsync.mockResolvedValue({
    result: { score: 60, recommendation: "maybe", summary: "rules", strengths: [], gaps: [], criteria: [] },
    rubric: { version: 1 },
    criterionResults: [],
    candidateFacts: null,
    skillProfiles: null,
    metadata: {},
    criterionAssessments: [],
    impactHighlights: [],
    evidenceCoverage: 0,
    confidence: 0,
    requiresHumanReview: false,
  });
  mocks.detectCandidateDuplicatesForWorkspace.mockResolvedValue([]);
});

describe("duplicate detection with anonymization on", () => {
  it("refuses with the user-facing message and never calls the provider", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-4o",
      apiKey: "sk",
      resumeAnonymization: true,
    });

    const result = await detectCandidateDuplicatesAction({ candidateId: CANDIDATE_ID });

    expect(result).toEqual({ ok: false, error: ANONYMIZATION_BLOCKED_MESSAGES.duplicateDetection });
    expect(mocks.detectCandidateDuplicatesForWorkspace).not.toHaveBeenCalled();
  });

  it("runs normally when anonymization is off", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-4o",
      apiKey: "sk",
      resumeAnonymization: false,
    });

    const result = await detectCandidateDuplicatesAction({ candidateId: CANDIDATE_ID });

    expect(result).toEqual({ ok: true, matches: [] });
    expect(mocks.detectCandidateDuplicatesForWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe("automatic scoring wiring", () => {
  it("passes the workspace anonymization setting to the scoring surface", async () => {
    const config = {
      provider: "openai",
      modelId: "gpt-4o",
      apiKey: "sk",
      resumeAnonymization: true,
    };
    mocks.getWorkspaceAiConfig.mockResolvedValue(config);
    mocks.scoreCandidateWithAI.mockResolvedValue({
      score: 70,
      recommendation: "yes",
      summary: "ok",
      strengths: [],
      gaps: [],
      criteria: [],
    });
    mocks.persistCandidateEvaluation.mockResolvedValue({ inputHash: "hash" });
    mocks.select
      .mockReturnValueOnce(selectReturning([APPLICATION_ROW]))
      .mockReturnValueOnce(selectReturning([]));

    const result = await generateAiEvaluationAction({ applicationId: APPLICATION_ID });

    expect(result).toEqual({ success: true });
    expect(mocks.scoreCandidateWithAI).toHaveBeenCalledWith(
      expect.objectContaining({ resumeAnonymization: true }),
      expect.objectContaining({
        candidate: expect.objectContaining({ fullName: "Ada Lovelace" }),
      }),
    );
  });
});
