import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  completeMyOpenTasks: vi.fn(),
  addToPoolAction: vi.fn(),
  createScorecard: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/pipeline/actions", () => ({
  moveApplicationStage: vi.fn(),
  updateApplicationStatus: vi.fn(),
}));
vi.mock("@/features/tasks/actions", () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  completeMyOpenTasks: mocks.completeMyOpenTasks,
}));
vi.mock("@/features/candidates/actions", () => ({
  createCandidateNote: vi.fn(),
  addCandidateTag: vi.fn(),
  createScorecard: mocks.createScorecard,
  sendCandidateMessage: vi.fn(),
}));
vi.mock("@/features/offers/actions", () => ({
  createOffer: vi.fn(),
  sendOffer: vi.fn(),
  decideOffer: vi.fn(),
}));
vi.mock("@/features/interviews/actions", () => ({ scheduleInterview: vi.fn() }));
vi.mock("@/features/pool/actions", () => ({
  addToPoolAction: mocks.addToPoolAction,
  assignFromPoolToJobAction: vi.fn(),
}));
vi.mock("@/features/jobs/service", () => ({ createJobForApi: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));

import { confirmAgentWriteAction } from "./write-actions";

describe("Harly AI task updates", () => {
  beforeEach(() => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mocks.updateTask.mockResolvedValue({ success: true });
    mocks.completeMyOpenTasks.mockResolvedValue({ success: true, updatedCount: 3 });
    mocks.createTask.mockResolvedValue({ success: true });
    mocks.addToPoolAction.mockResolvedValue({ success: true });
    mocks.createScorecard.mockResolvedValue({ success: true });
  });

  it("updates one task without treating AI null fields as edits", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const result = await confirmAgentWriteAction("updateTask", {
      taskId,
      status: "completed",
      title: null,
      priority: null,
      dueDate: null,
      clearDueDate: false,
      ownerId: null,
    });

    expect(result).toMatchObject({ success: true, message: "Task updated." });
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask).toHaveBeenCalledWith({
      taskId,
      status: "completed",
      title: undefined,
      priority: undefined,
      dueDate: undefined,
      ownerId: undefined,
    });
  });

  it("accepts null optional fields from strict AI write tools", async () => {
    await expect(confirmAgentWriteAction("createTask", {
      title: "Follow up", description: null, priority: "medium", dueDate: null,
      candidateId: null, applicationId: null, jobId: null,
    })).resolves.toMatchObject({ success: true });
    await expect(confirmAgentWriteAction("addToTalentPool", {
      candidateId: "candidate-1", source: null, reason: null,
    })).resolves.toMatchObject({ success: true });
    await expect(confirmAgentWriteAction("createScorecard", {
      candidateId: "candidate-1", rating: "strong", comment: null, stageName: null,
    })).resolves.toMatchObject({ success: true });

    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      description: undefined, dueDate: undefined,
    }));
    expect(mocks.addToPoolAction).toHaveBeenCalledWith({
      candidateId: "candidate-1", source: undefined, reason: undefined,
    });
    expect(mocks.createScorecard).toHaveBeenCalledWith(expect.objectContaining({
      comment: undefined, stageName: null,
    }));
  });

  it("clears a due date only when the AI explicitly requests it", async () => {
    await expect(confirmAgentWriteAction("updateTask", {
      taskId: "11111111-1111-4111-8111-111111111111",
      status: null,
      title: null,
      priority: null,
      dueDate: null,
      clearDueDate: true,
      ownerId: null,
    })).resolves.toMatchObject({ success: true });

    expect(mocks.updateTask).toHaveBeenLastCalledWith(expect.objectContaining({ dueDate: "" }));
  });

  it("rejects legacy task-id batches rather than applying a partial update", async () => {
    await expect(confirmAgentWriteAction("updateTask", {
      taskId: null,
      taskIds: ["11111111-1111-4111-8111-111111111111"],
      status: "completed",
      title: null,
      priority: null,
      dueDate: null,
      clearDueDate: false,
      ownerId: null,
    })).resolves.toMatchObject({ success: false });
  });

  it("completes all and only the signed-in user's open tasks through the server action", async () => {
    mocks.updateTask.mockClear();
    await expect(confirmAgentWriteAction("completeMyOpenTasks", {
      summary: "Complete every open task assigned to me.",
    })).resolves.toEqual({
      success: true,
      message: "Completed 3 open tasks assigned to you.",
    });

    expect(mocks.completeMyOpenTasks).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});
