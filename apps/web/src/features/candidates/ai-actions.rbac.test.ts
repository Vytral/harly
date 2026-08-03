import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  requirePermission: vi.fn(),
  requireApplicationPermission: vi.fn(),
  requireJobPermission: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  enforceRateLimit: vi.fn(),
  loadResumeText: vi.fn(),
  logAiCandidateDecision: vi.fn(),
  scoreCandidateWithAI: vi.fn(),
  persistCandidateEvaluation: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  notInArray: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
  activityEvents: {},
  aiEvaluations: {},
  applicationAnswers: {},
  applicationQuestions: {},
  applications: {},
  candidates: {},
  jobs: {},
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireApplicationPermission: mocks.requireApplicationPermission,
  requireJobPermission: mocks.requireJobPermission,
}));

vi.mock("@/lib/ai/config", () => ({
  getWorkspaceAiConfig: mocks.getWorkspaceAiConfig,
}));

vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/resume/load-resume-text", () => ({
  loadResumeText: mocks.loadResumeText,
}));

vi.mock("@/lib/ai/governance", () => ({
  logAiCandidateDecision: mocks.logAiCandidateDecision,
}));

vi.mock("@/lib/ai/surfaces/score-candidate", () => ({
  scoreCandidateWithAI: mocks.scoreCandidateWithAI,
}));

vi.mock("@/lib/evaluation/rules", () => ({
  evaluateCandidateWithRules: vi.fn(),
  RULES_EVALUATION_VERSION: "rules-v1",
}));

vi.mock("@/features/evaluations/service", () => ({
  getPublishedRulesRubric: vi.fn(),
  persistCandidateEvaluation: mocks.persistCandidateEvaluation,
}));

vi.mock("@/features/candidates/duplicate-detection", () => ({
  detectCandidateDuplicatesForWorkspace: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  bulkGenerateAiEvaluationsForJobAction,
  generateAiEvaluationAction,
} from "./ai-actions";

const WORKSPACE_ID = "workspace-1";

function makeSelectReturning(rows: unknown[]) {
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

describe("AI evaluation application authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
    });
    mocks.requireApplicationPermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
    });
    mocks.requireJobPermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
    });
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  });

  it("rejects individual scoring before reading the application when its job is outside scope", async () => {
    mocks.requireApplicationPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const result = await generateAiEvaluationAction({
      applicationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to run automatic evaluations.",
    });
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "collab:write",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects bulk scoring before loading applications when the job is outside scope", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const result = await bulkGenerateAiEvaluationsForJobAction({
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({
      success: false,
      error: "Permission denied.",
    });
    expect(mocks.requireJobPermission).toHaveBeenCalledWith(
      "collab:write",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rate-limits individual scoring before reading the application", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("rate limited"));

    const result = await generateAiEvaluationAction({
      applicationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({
      success: false,
      error: "Too many scoring requests. Slow down and try again shortly.",
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("ai-score:workspace-1"),
      expect.objectContaining({ limit: expect.any(Number), windowMs: expect.any(Number) }),
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("records the real candidate skills count in the AI governance audit", async () => {
    mocks.getWorkspaceAiConfig.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-4o",
    });
    mocks.loadResumeText.mockResolvedValue({ text: "resume text" });
    mocks.scoreCandidateWithAI.mockResolvedValue({
      score: 82,
      recommendation: "yes",
      summary: "Strong fit",
      strengths: [],
      gaps: [],
      criteria: [],
    });
    mocks.persistCandidateEvaluation.mockResolvedValue({ inputHash: "hash" });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            applicationId: "11111111-1111-4111-8111-111111111111",
            candidateId: "33333333-3333-4333-8333-333333333333",
            jobId: "22222222-2222-4222-8222-222222222222",
            firstName: "Ada",
            lastName: "Lovelace",
            headline: null,
            location: null,
            skills: ["TypeScript", "SQL"],
            experienceYears: 5,
            jobTitle: "Engineer",
            jobDescription: "Build things",
            jobRequirements: null,
            jobSector: null,
            jobExperienceLevel: null,
            jobEducation: null,
            jobKeywords: [],
            evaluationMode: "balanced",
          },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([{ question: "Availability", answer: "Soon" }]),
      );

    const result = await generateAiEvaluationAction({
      applicationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({ success: true });
    expect(mocks.logAiCandidateDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSummary: expect.objectContaining({ skillsCount: 2 }),
      }),
    );
  });

  it("rejects the whole bulk batch when one application is outside the assigned job scope", async () => {
    let selectCall = 0;
    mocks.getWorkspaceAiConfig.mockResolvedValue(null);
    mocks.requireApplicationPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );
    mocks.select.mockImplementation(() => {
      selectCall += 1;
      const rows =
        selectCall === 1
          ? [{ evaluationMode: "balanced" }]
          : selectCall === 3
            ? [{ applicationId: "blocked-application" }]
            : [];
      const builder: Record<string, unknown> = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => void) => resolve(rows),
      };
      return builder;
    });

    const result = await bulkGenerateAiEvaluationsForJobAction({
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ success: false, error: "Permission denied." });
    expect(mocks.requireApplicationPermission).toHaveBeenCalledWith(
      "collab:write",
      "blocked-application",
    );
  });
});
