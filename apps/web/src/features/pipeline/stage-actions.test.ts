import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  createStage: vi.fn(),
  updateStage: vi.fn(),
  reorderStages: vi.fn(),
  archiveStage: vi.fn(),
  deleteStage: vi.fn(),
  listJobStages: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError, info: vi.fn(), warn: vi.fn() }),
}));

vi.mock("./stage-lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stage-lifecycle")>()),
  createStage: mocks.createStage,
  updateStage: mocks.updateStage,
  reorderStages: mocks.reorderStages,
  archiveStage: mocks.archiveStage,
  deleteStage: mocks.deleteStage,
  listJobStages: mocks.listJobStages,
}));

import { ApiError } from "@harly/api";

import {
  archiveJobStageAction,
  createJobStageAction,
  deleteJobStageAction,
  listJobStagesAction,
  reorderJobStagesAction,
  updateJobStageAction,
} from "./stage-actions";

const WORKSPACE_ID = "workspace-1";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const STAGE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STAGE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "recruiter-1";

const context = {
  organization: { id: WORKSPACE_ID, slug: "acme" },
  user: { id: USER_ID, email: "recruiter@example.test" },
  roleKey: "recruiter",
};

const stageSummary = { id: STAGE_ID, name: "Interview", kind: "interview" };

describe("pipeline stage server actions: authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireJobPermission.mockResolvedValue(context);
    mocks.createStage.mockResolvedValue(stageSummary);
    mocks.updateStage.mockResolvedValue(stageSummary);
    mocks.reorderStages.mockResolvedValue([stageSummary]);
    mocks.archiveStage.mockResolvedValue({ stage: stageSummary, movedApplications: 0 });
    mocks.deleteStage.mockResolvedValue(undefined);
    mocks.listJobStages.mockResolvedValue([stageSummary]);
  });

  it("requires jobs:edit on the job for every mutation", async () => {
    await createJobStageAction({ jobId: JOB_ID, name: "Panel" });
    await updateJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID, name: "Panel" });
    await reorderJobStagesAction({ jobId: JOB_ID, stageIds: [STAGE_ID] });
    await archiveJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID });
    await deleteJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID });

    for (const call of mocks.requireJobPermission.mock.calls) {
      expect(call).toEqual(["jobs:edit", JOB_ID]);
    }
    expect(mocks.requireJobPermission).toHaveBeenCalledTimes(5);
  });

  it("reads stages with jobs:view and passes the actor's workspace, not client input", async () => {
    await listJobStagesAction({ jobId: JOB_ID, includeArchived: true });

    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:view", JOB_ID);
    expect(mocks.listJobStages).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      jobId: JOB_ID,
      includeArchived: true,
    });
  });

  it("rejects a user without jobs:edit and never calls the service", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You do not have permission to perform this action."),
    );

    const result = await createJobStageAction({ jobId: JOB_ID, name: "Panel" });

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
    });
    expect(mocks.createStage).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a scoped recruiter who is not assigned to the job", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const result = await archiveJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID });

    expect(result).toEqual({ success: false, error: "You are not assigned to this job." });
    expect(mocks.archiveStage).not.toHaveBeenCalled();
  });

  it("lets Next control-flow errors (redirects) escape instead of returning them", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    mocks.requireJobPermission.mockRejectedValue(redirect);

    await expect(
      deleteJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID }),
    ).rejects.toBe(redirect);
  });

  it("validates input before authorizing or touching the service", async () => {
    const result = await createJobStageAction({ jobId: "not-a-uuid", name: "Panel" });

    expect(result.success).toBe(false);
    expect(mocks.requireJobPermission).not.toHaveBeenCalled();
    expect(mocks.createStage).not.toHaveBeenCalled();
  });
});

describe("pipeline stage server actions: results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireJobPermission.mockResolvedValue(context);
  });

  it("returns the created stage and revalidates the job and pipeline pages", async () => {
    mocks.createStage.mockResolvedValue(stageSummary);

    const result = await createJobStageAction({
      jobId: JOB_ID,
      name: "Interview",
      kind: "interview",
      position: 1,
    });

    expect(result).toEqual({ success: true, stage: stageSummary });
    expect(mocks.createStage).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      jobId: JOB_ID,
      actorUserId: USER_ID,
      name: "Interview",
      color: undefined,
      kind: "interview",
      position: 1,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/jobs/${JOB_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/pipeline");
  });

  it("returns ApiError messages to the client as failures", async () => {
    mocks.updateStage.mockRejectedValue(
      ApiError.conflict("Archived stages cannot be edited."),
    );

    const result = await updateJobStageAction({
      jobId: JOB_ID,
      stageId: STAGE_ID,
      name: "Renamed",
    });

    expect(result).toEqual({ success: false, error: "Archived stages cannot be edited." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps merge results and forwards the merge target", async () => {
    mocks.archiveStage.mockResolvedValue({ stage: stageSummary, movedApplications: 3 });

    const result = await archiveJobStageAction({
      jobId: JOB_ID,
      stageId: STAGE_ID,
      mergeIntoStageId: OTHER_STAGE_ID,
    });

    expect(result).toEqual({ success: true, stage: stageSummary, movedApplications: 3 });
    expect(mocks.archiveStage).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: STAGE_ID, mergeIntoStageId: OTHER_STAGE_ID }),
    );
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    mocks.reorderStages.mockRejectedValue(new Error("connection reset by peer"));

    const result = await reorderJobStagesAction({ jobId: JOB_ID, stageIds: [STAGE_ID] });

    expect(result).toEqual({
      success: false,
      error: "The pipeline could not be updated. Try again.",
    });
    expect(mocks.logError).toHaveBeenCalled();
  });

  it("returns the delete result without a payload", async () => {
    const result = await deleteJobStageAction({ jobId: JOB_ID, stageId: STAGE_ID });

    expect(result).toEqual({ success: true });
    expect(mocks.deleteStage).toHaveBeenCalledWith(
      expect.objectContaining({ stageId: STAGE_ID }),
    );
  });
});
