import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  requirePagePermission: vi.fn(),
  can: vi.fn(),
  getWorkspaceContext: vi.fn(),
  getDashboardJob: vi.fn(),
  listWorkspaceDepartments: vi.fn(),
  listJobHiringTeam: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  getCareerPageData: vi.fn(),
  getWorkspaceAiStatus: vi.fn(),
  countCandidatePool: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePagePermission: mocks.requirePagePermission,
  can: mocks.can,
}));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock("@/features/jobs/data", () => ({
  getDashboardJob: mocks.getDashboardJob,
  listWorkspaceDepartments: mocks.listWorkspaceDepartments,
}));
vi.mock("@/features/jobs/hiring-team-data", () => ({
  listJobHiringTeam: mocks.listJobHiringTeam,
  listWorkspaceMembers: mocks.listWorkspaceMembers,
}));
vi.mock("@/features/career-page/data", () => ({ getCareerPageData: mocks.getCareerPageData }));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiStatus: mocks.getWorkspaceAiStatus }));
vi.mock("@/features/matching/data", () => ({ countCandidatePool: mocks.countCandidatePool }));
vi.mock("@/features/jobs/actions", () => ({ updateJobAction: vi.fn() }));
vi.mock("@/features/jobs/JobForm", () => ({ JobForm: () => null }));
vi.mock("@/features/jobs/JobActionsMenu", () => ({ JobActionsMenu: () => null }));
vi.mock("@/features/jobs/JobShareButton", () => ({ JobShareButton: () => null }));
vi.mock("@/features/jobs/JobStatusActions", () => ({ JobStatusActions: () => null }));
vi.mock("@/features/pipeline/stage-editor/StageEditorTrigger", () => ({ StageEditorTrigger: () => null }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "https://harly.test" }));

import DashboardJobPage from "./page";

describe("job detail page (fullscreen)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue({ organization: { id: "ws-1", slug: "acme" } });
    mocks.can.mockResolvedValue(true);
    mocks.listWorkspaceDepartments.mockResolvedValue([]);
    mocks.listWorkspaceMembers.mockResolvedValue([]);
    mocks.listJobHiringTeam.mockResolvedValue([]);
    mocks.getCareerPageData.mockResolvedValue(null);
    mocks.getWorkspaceAiStatus.mockResolvedValue({});
    mocks.countCandidatePool.mockResolvedValue(0);
  });

  it("returns not found for a job outside the caller's scope without loading its hiring team", async () => {
    mocks.getDashboardJob.mockResolvedValue(null);

    await expect(
      DashboardJobPage({ params: Promise.resolve({ jobId: "job-outside-scope" }) }),
    ).rejects.toThrow("notFound");

    expect(mocks.getDashboardJob).toHaveBeenCalledWith("job-outside-scope");
    expect(mocks.listJobHiringTeam).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceAiStatus).not.toHaveBeenCalled();
    expect(mocks.countCandidatePool).not.toHaveBeenCalled();
    expect(mocks.getCareerPageData).not.toHaveBeenCalled();
  });
});
