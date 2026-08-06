import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRolePolicy: vi.fn(),
  requireJobPermission: vi.fn(),
  requirePermission: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  supportsEmbeddings: vi.fn(),
  countCandidatePool: vi.fn(),
  countCandidatesNeedingIndex: vi.fn(),
  matchCandidatesForJob: vi.fn(),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  getRolePolicy: mocks.getRolePolicy,
  requireJobPermission: mocks.requireJobPermission,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/ai/config", () => ({
  getWorkspaceAiConfig: mocks.getWorkspaceAiConfig,
}));
vi.mock("@/lib/ai/embeddings", () => ({
  supportsEmbeddings: mocks.supportsEmbeddings,
}));
vi.mock("@/features/matching/data", () => ({
  countCandidatePool: mocks.countCandidatePool,
  countCandidatesNeedingIndex: mocks.countCandidatesNeedingIndex,
  indexCandidateBatch: vi.fn(),
  matchCandidatesForJob: mocks.matchCandidatesForJob,
}));
vi.mock("@/features/matching/constants", () => ({
  SEMANTIC_MATCH_LIMIT: 20,
}));

import { generateJobMatchesAction } from "./actions";
import { indexCandidatesForMatchingAction } from "./actions";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "workspace-1";

describe("semantic matching authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireJobPermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
    });
    mocks.requirePermission.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      roleKey: "recruiter",
    });
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "all", departments: [], regions: [] },
    });
    mocks.getWorkspaceAiConfig.mockResolvedValue({ provider: "openai" });
    mocks.supportsEmbeddings.mockReturnValue(true);
    mocks.countCandidatePool.mockResolvedValue(1);
    mocks.countCandidatesNeedingIndex.mockResolvedValue(0);
    mocks.matchCandidatesForJob.mockResolvedValue([]);
  });

  it("authorizes the requested job before loading or ranking candidate PII", async () => {
    await expect(generateJobMatchesAction({ jobId: JOB_ID })).resolves.toEqual({
      success: true,
      matches: [],
    });

    expect(mocks.requireJobPermission).toHaveBeenCalledWith(
      "candidates:edit",
      JOB_ID,
    );
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.matchCandidatesForJob).toHaveBeenCalledWith(
      { provider: "openai" },
      WORKSPACE_ID,
      JOB_ID,
      20,
    );
  });

  it("does not query the candidate pool when the job is outside scope", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    await expect(
      generateJobMatchesAction({ jobId: JOB_ID }),
    ).rejects.toThrow("You are not assigned to this job.");

    expect(mocks.countCandidatePool).not.toHaveBeenCalled();
    expect(mocks.matchCandidatesForJob).not.toHaveBeenCalled();
  });

  it("does not return workspace-wide matches to a scoped role", async () => {
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });

    await expect(generateJobMatchesAction({ jobId: JOB_ID })).resolves.toEqual({
      success: false,
      error: "Semantic matching requires workspace-wide candidate access.",
    });
    expect(mocks.countCandidatePool).not.toHaveBeenCalled();
    expect(mocks.matchCandidatesForJob).not.toHaveBeenCalled();
  });

  it("does not index the whole candidate pool for a scoped role", async () => {
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });

    await expect(indexCandidatesForMatchingAction()).resolves.toEqual({
      success: false,
      error: "Semantic indexing requires workspace-wide candidate access.",
    });
    expect(mocks.getWorkspaceAiConfig).not.toHaveBeenCalled();
  });
});
