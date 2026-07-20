import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  completeMyOpenTasks: vi.fn(),
  addToPoolAction: vi.fn(),
  createScorecard: vi.fn(),
  scheduleInterview: vi.fn(),
  setInterviewStatus: vi.fn(),
  moveApplicationStage: vi.fn(),
  reserveAgentAction: vi.fn(),
  getAgentActionReceipt: vi.fn(),
  getApplicationForApi: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/pipeline/actions", () => ({
  moveApplicationStage: mocks.moveApplicationStage,
  updateApplicationStatus: vi.fn(),
}));
vi.mock("@/features/tasks/actions", () => ({
  createTask: mocks.createTask,
  deleteTask: mocks.deleteTask,
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
vi.mock("@/features/interviews/actions", () => ({
  scheduleInterview: mocks.scheduleInterview,
  setInterviewStatus: mocks.setInterviewStatus,
}));
vi.mock("@/features/pool/actions", () => ({
  addToPoolAction: mocks.addToPoolAction,
  assignFromPoolToJobAction: vi.fn(),
}));
vi.mock("@/features/jobs/service", () => ({ createJobForApi: vi.fn() }));
vi.mock("@/features/applications/service", () => ({
  getApplicationForApi: mocks.getApplicationForApi,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("./action-receipts", () => ({
  reserveAgentAction: mocks.reserveAgentAction,
  getAgentActionReceipt: mocks.getAgentActionReceipt,
  parseAgentActionUndo: (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : null,
}));

import { confirmAgentWriteAction, undoAgentWriteAction } from "./write-actions";

describe("Harly AI task updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mocks.updateTask.mockResolvedValue({ success: true });
    mocks.completeMyOpenTasks.mockResolvedValue({
      success: true,
      updatedCount: 3,
    });
    mocks.createTask.mockResolvedValue({ success: true });
    mocks.deleteTask.mockResolvedValue({ success: true });
    mocks.addToPoolAction.mockResolvedValue({ success: true });
    mocks.createScorecard.mockResolvedValue({ success: true });
    mocks.scheduleInterview.mockResolvedValue({ success: true });
    mocks.setInterviewStatus.mockResolvedValue({ success: true });
    mocks.moveApplicationStage.mockResolvedValue({ success: true });
    mocks.getApplicationForApi.mockResolvedValue({
      currentStageId: "11111111-1111-4111-8111-111111111111",
    });
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
    await expect(
      confirmAgentWriteAction("createTask", {
        title: "Follow up",
        description: null,
        priority: "medium",
        dueDate: null,
        candidateId: null,
        applicationId: null,
        jobId: null,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      confirmAgentWriteAction("addToTalentPool", {
        candidateId: "candidate-1",
        source: null,
        reason: null,
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      confirmAgentWriteAction("createScorecard", {
        candidateId: "candidate-1",
        applicationId: "11111111-1111-4111-8111-111111111111",
        stageId: null,
        rating: "strong",
        comment: null,
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        description: undefined,
        dueDate: undefined,
      }),
    );
    expect(mocks.addToPoolAction).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      source: undefined,
      reason: undefined,
    });
    expect(mocks.createScorecard).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "11111111-1111-4111-8111-111111111111",
        stageId: null,
        comment: undefined,
      }),
    );
  });

  it("makes a newly created task undoable only at its original version", async () => {
    const updatedAt = "2026-07-20T03:00:00.000Z";
    mocks.createTask.mockResolvedValue({
      success: true,
      taskId: "11111111-1111-4111-8111-111111111111",
      updatedAt,
    });

    await expect(
      confirmAgentWriteAction("createTask", {
        title: "Follow up with Maximiliano",
        description: null,
        priority: "medium",
        dueDate: null,
        candidateId: null,
        applicationId: null,
        jobId: null,
      }),
    ).resolves.toMatchObject({
      success: true,
      undo: {
        kind: "deleteTask",
        taskId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: updatedAt,
      },
    });
  });

  it("clears a due date only when the AI explicitly requests it", async () => {
    await expect(
      confirmAgentWriteAction("updateTask", {
        taskId: "11111111-1111-4111-8111-111111111111",
        status: null,
        title: null,
        priority: null,
        dueDate: null,
        clearDueDate: true,
        ownerId: null,
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mocks.updateTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ dueDate: "" }),
    );
  });

  it("rejects legacy task-id batches rather than applying a partial update", async () => {
    await expect(
      confirmAgentWriteAction("updateTask", {
        taskId: null,
        taskIds: ["11111111-1111-4111-8111-111111111111"],
        status: "completed",
        title: null,
        priority: null,
        dueDate: null,
        clearDueDate: false,
        ownerId: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it("completes all and only the signed-in user's open tasks through the server action", async () => {
    mocks.updateTask.mockClear();
    await expect(
      confirmAgentWriteAction("completeMyOpenTasks", {
        summary: "Complete every open task assigned to me.",
      }),
    ).resolves.toEqual({
      success: true,
      message: "Completed 3 open tasks assigned to you.",
    });

    expect(mocks.completeMyOpenTasks).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it("confirms a stage move with the workspace-scoped application and destination", async () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    const toStageId = "22222222-2222-4222-8222-222222222222";

    await expect(
      confirmAgentWriteAction("moveCandidateStage", {
        summary: "Move Maximiliano to Interview",
        applicationId,
        toStageId,
        candidateName: "Maximiliano Moldenhauer",
        fromStageName: "Screening",
        toStageName: "Interview",
      }),
    ).resolves.toMatchObject({ success: true, message: "Stage updated." });

    expect(mocks.moveApplicationStage).toHaveBeenCalledWith({
      applicationId,
      fromStageId: null,
      toStageId,
      workspaceId: "workspace-1",
    });
  });

  it("replays a confirmed action without running the underlying write twice", async () => {
    mocks.moveApplicationStage.mockClear();
    const complete = vi.fn().mockResolvedValue(undefined);
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "reserved",
      receiptId: "receipt-1",
      complete,
    });

    const input = {
      applicationId: "11111111-1111-4111-8111-111111111111",
      toStageId: "22222222-2222-4222-8222-222222222222",
      candidateName: "Maximiliano Moldenhauer",
      fromStageName: "Screening",
      toStageName: "Interview",
    };

    await expect(
      confirmAgentWriteAction("moveCandidateStage", input, "tool-call-1"),
    ).resolves.toMatchObject({ success: true, receiptId: "receipt-1" });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      error: undefined,
      message: "Stage updated.",
    }));
    expect(mocks.moveApplicationStage).toHaveBeenCalledTimes(1);

    mocks.reserveAgentAction.mockResolvedValue({
      kind: "replay",
      receiptId: "receipt-1",
      result: { success: true, message: "Stage updated." },
    });

    await expect(
      confirmAgentWriteAction("moveCandidateStage", input, "tool-call-1"),
    ).resolves.toMatchObject({
      success: true,
      message: "Stage updated.",
      replayed: true,
      receiptId: "receipt-1",
    });
    expect(mocks.moveApplicationStage).toHaveBeenCalledTimes(1);
  });

  it("does not run a write when the receipt is already processing", async () => {
    mocks.moveApplicationStage.mockClear();
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "conflict",
      error: "This action is already being processed. Please wait a moment.",
    });

    await expect(
      confirmAgentWriteAction(
        "moveCandidateStage",
        {
          applicationId: "11111111-1111-4111-8111-111111111111",
          toStageId: "22222222-2222-4222-8222-222222222222",
          candidateName: "Maximiliano Moldenhauer",
          fromStageName: "Screening",
          toStageName: "Interview",
        },
        "tool-call-processing",
      ),
    ).resolves.toEqual({
      success: false,
      error: "This action is already being processed. Please wait a moment.",
    });
    expect(mocks.moveApplicationStage).not.toHaveBeenCalled();
  });

  it("undoes a stage move only through its scoped receipt", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    mocks.getAgentActionReceipt.mockResolvedValue({
      toolName: "moveCandidateStage",
      result: {
        success: true,
        message: "Stage updated.",
        undo: {
          kind: "moveCandidateStage",
          applicationId: "11111111-1111-4111-8111-111111111111",
          expectedCurrentStageId: "22222222-2222-4222-8222-222222222222",
          previousStageId: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "reserved",
      receiptId: "undo-receipt-1",
      complete,
    });

    await expect(undoAgentWriteAction("receipt-1")).resolves.toMatchObject({
      success: true,
      message: "Action undone.",
      receiptId: "undo-receipt-1",
    });
    expect(mocks.moveApplicationStage).toHaveBeenCalledWith({
      applicationId: "11111111-1111-4111-8111-111111111111",
      fromStageId: "22222222-2222-4222-8222-222222222222",
      toStageId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "workspace-1",
    });
    expect(complete).toHaveBeenCalledWith({
      success: true,
      error: undefined,
      message: "Action undone.",
    });
  });

  it("undoes a task creation through a version-checked delete", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    const expectedUpdatedAt = "2026-07-20T03:00:00.000Z";
    mocks.getAgentActionReceipt.mockResolvedValue({
      toolName: "createTask",
      result: {
        success: true,
        undo: {
          kind: "deleteTask",
          taskId: "task-1",
          expectedUpdatedAt,
        },
      },
    });
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "reserved",
      receiptId: "undo-task-receipt",
      complete,
    });

    await expect(undoAgentWriteAction("receipt-task-1")).resolves.toMatchObject({
      success: true,
      message: "Action undone.",
    });
    expect(mocks.deleteTask).toHaveBeenCalledWith("task-1", expectedUpdatedAt);
  });

  it("undoes a scheduled interview by canceling only while it remains scheduled", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    mocks.getAgentActionReceipt.mockResolvedValue({
      toolName: "scheduleInterview",
      result: {
        success: true,
        undo: {
          kind: "cancelInterview",
          interviewId: "interview-1",
          candidateId: "candidate-1",
          expectedStatus: "scheduled",
        },
      },
    });
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "reserved",
      receiptId: "undo-interview-receipt",
      complete,
    });

    await expect(undoAgentWriteAction("receipt-interview-1")).resolves.toMatchObject({
      success: true,
      message: "Action undone.",
    });
    expect(mocks.setInterviewStatus).toHaveBeenCalledWith({
      interviewId: "interview-1",
      candidateId: "candidate-1",
      status: "canceled",
    });
  });

  it("routes the confirmed undo tool through the same safe undo seam", async () => {
    const outerComplete = vi.fn().mockResolvedValue(undefined);
    const innerComplete = vi.fn().mockResolvedValue(undefined);
    mocks.getAgentActionReceipt.mockResolvedValue({
      toolName: "moveCandidateStage",
      result: {
        success: true,
        undo: {
          kind: "moveCandidateStage",
          applicationId: "application-1",
          expectedCurrentStageId: "stage-2",
          previousStageId: "stage-1",
        },
      },
    });
    mocks.reserveAgentAction
      .mockResolvedValueOnce({ kind: "reserved", receiptId: "outer-receipt", complete: outerComplete })
      .mockResolvedValueOnce({ kind: "reserved", receiptId: "inner-receipt", complete: innerComplete });

    await expect(
      confirmAgentWriteAction(
        "undoAgentAction",
        { summary: "Undo the last move", receiptId: "receipt-1" },
        "undo-tool-call-1",
      ),
    ).resolves.toMatchObject({ success: true, message: "Action undone." });
    expect(mocks.moveApplicationStage).toHaveBeenCalledWith({
      applicationId: "application-1",
      fromStageId: "stage-2",
      toStageId: "stage-1",
      workspaceId: "workspace-1",
    });
    expect(innerComplete).toHaveBeenCalled();
    expect(outerComplete).toHaveBeenCalled();
  });

  it("removes accidental terminal punctuation from an AI interview title", async () => {
    await expect(
      confirmAgentWriteAction("scheduleInterview", {
        candidateId: "candidate-1",
        applicationId: "11111111-1111-4111-8111-111111111111",
        type: "screening",
        mode: "video",
        scheduledAt: "2026-07-20T13:00",
        timeZone: "America/Santiago",
        durationMins: 60,
        interviewerId: null,
        title: "Introduction to Syntrix.",
        location: "https://meet.google.com/wdk-sfc-xck",
        notes: null,
        meetingProvider: "external",
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mocks.scheduleInterview).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Introduction to Syntrix" }),
    );
  });
});
