import { beforeEach, describe, expect, it, vi } from "vitest";
import { semanticGraphHash } from "@/features/automations/definition/hash";
import { addCandidateTag, createCandidateNote, createScorecard } from "@/features/candidates/actions";
import { bulkGenerateAiEvaluationsForJobAction } from "@/features/candidates/ai-actions";
import { createOffer, decideOffer, sendOffer } from "@/features/offers/actions";
import { updateApplicationStatus } from "@/features/pipeline/actions";
import { addToPoolAction, assignFromPoolToJobAction } from "@/features/pool/actions";
import { createJobForApi } from "@/features/jobs/service";
import { requirePermission } from "@/features/workspaces/permissions-server";

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
  verifyInterviewOutcome: vi.fn(),
  getAutomationProposal: vi.fn(),
  applyAutomationProposal: vi.fn(),
  getActorPermissions: vi.fn(),
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
  getActorPermissions: mocks.getActorPermissions,
  // The target scope gate: these unit tests cover write mechanics, so every
  // record is in scope for an unrestricted caller.
  getRolePolicy: vi.fn(async () => ({
    permissions: [],
    scope: { jobAccess: "all", departments: [], regions: [] },
  })),
  requireApplicationPermission: vi.fn(async () => ({})),
  requireCandidatePermission: vi.fn(async () => ({})),
  requireInterviewPermission: vi.fn(async () => ({})),
  requireJobPermission: vi.fn(async () => ({})),
  requireOfferPermission: vi.fn(async () => ({})),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/candidates/ai-actions", () => ({
  bulkGenerateAiEvaluationsForJobAction: vi.fn(),
  generateAiEvaluationAction: vi.fn(),
}));
vi.mock("./action-receipts", () => ({
  reserveAgentAction: mocks.reserveAgentAction,
  getAgentActionReceipt: mocks.getAgentActionReceipt,
  parseAgentActionUndo: (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : null,
}));
vi.mock("./interview-outcome", () => ({
  verifyInterviewOutcome: mocks.verifyInterviewOutcome,
}));
vi.mock("@/features/automations/ai-proposals", () => ({
  getAutomationProposal: mocks.getAutomationProposal,
  applyAutomationProposal: mocks.applyAutomationProposal,
  createAutomationProposalPreviewToken: vi.fn(() => "preview-token-for-test"),
  verifyAutomationProposalPreviewToken: vi.fn(() => false),
}));

import {
  confirmAgentWriteAction,
  prepareAgentWriteAction,
  undoAgentWriteAction,
} from "./write-actions";

describe("Harly AI task updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mocks.getActorPermissions.mockResolvedValue([
      "jobs:create", "jobs:view", "jobs:edit", "jobs:delete", "jobs:publish", "jobs:approve",
      "hiring_team:manage", "candidates:view", "candidates:edit", "candidates:delete", "candidates:move",
      "dsar:manage", "collab:write", "interviews:manage", "interviews:feedback", "tasks:read", "tasks:write",
      "offers:manage", "offers:approve", "templates:manage", "reports:read", "members:read", "members:invite",
      "members:edit", "members:remove", "invite_links:manage", "settings:edit", "integrations:manage",
      "roles:manage", "security:manage", "documents:read", "documents:manage", "documents:share", "automations:manage",
    ]);
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
    mocks.verifyInterviewOutcome.mockResolvedValue({
      persisted: true,
      interviewId: "interview-1",
      candidateId: "candidate-1",
      applicationId: "application-1",
      jobId: "job-1",
      status: "scheduled",
      scheduledAt: "2026-07-21T13:00:00.000Z",
      durationMins: 60,
      location: null,
      meetingLink: null,
      syncs: [],
      outcomeStatus: "complete",
      warnings: [],
    });
    mocks.setInterviewStatus.mockResolvedValue({ success: true });
    mocks.moveApplicationStage.mockResolvedValue({ success: true });
    mocks.getApplicationForApi.mockResolvedValue({
      currentStageId: "11111111-1111-4111-8111-111111111111",
    });
    const proposalGraph = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [{ id: "trigger", type: "trigger", event: "application.created" }],
      edges: [],
    };
    mocks.getAutomationProposal.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      workflowId: "22222222-2222-4222-8222-222222222222",
      baseRevision: 4,
      name: "Tag high-priority applicants",
      issues: [],
      status: "prepared",
      graph: proposalGraph,
      simulation: {
        status: "verified",
        coveragePercent: 100,
        coveredNodeIds: ["trigger"],
        uncoveredNodeIds: [],
        scenarios: [],
        allNodeIds: ["trigger"],
        simulationHash: "test-hash",
        graphHash: semanticGraphHash(proposalGraph as never),
        simulatedAt: new Date().toISOString(),
      },
      diff: [
        { kind: "node_added", id: "tag" },
        { kind: "edge_changed", id: "e1" },
      ],
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

  it("shows a verified automation diff before confirmation", async () => {
    const proposalId = "11111111-1111-4111-8111-111111111111";
    await expect(
      prepareAgentWriteAction("applyAutomationProposal", { proposalId }),
    ).resolves.toMatchObject({
      ok: true,
      canonical: true,
      title: "Apply automation proposal",
      details: expect.arrayContaining([
        { label: "Automation", value: "Tag high-priority applicants" },
        { label: "Steps", value: "1 added" },
        { label: "Test result", value: "verified (100% branch coverage)" },
      ]),
      automationChanges: [{ kind: "node_added", id: "tag", title: "Tag" }],
    });
    expect(mocks.getAutomationProposal).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
      proposalId,
    });
  });

  it("rejects direct proposal confirmation without the server preview token", async () => {
    const result = await confirmAgentWriteAction("applyAutomationProposal", {
      proposalId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("fresh server preview"),
    });
    expect(mocks.applyAutomationProposal).not.toHaveBeenCalled();
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
      updatedCount: 3,
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

  it("returns verified delivery details after scheduling an interview", async () => {
    const interviewId = "33333333-3333-4333-8333-333333333333";
    mocks.scheduleInterview.mockResolvedValue({
      success: true,
      interviewId,
      emailStatus: "sent",
    });

    await expect(
      confirmAgentWriteAction("scheduleInterview", {
        candidateId: "11111111-1111-4111-8111-111111111111",
        applicationId: "22222222-2222-4222-8222-222222222222",
        type: "technical",
        mode: "video",
        scheduledAt: "2026-07-21T13:00:00",
        timeZone: "America/Santiago",
        durationMins: 60,
        interviewerId: null,
        title: "Introduction to Syntrix",
        location: "https://meet.google.com/test-link",
        notes: null,
        meetingProvider: "external",
      }),
    ).resolves.toMatchObject({
      success: true,
      interviewId,
      deliveryStatus: "complete",
      emailStatus: "sent",
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
      targets: { applicationId: "11111111-1111-4111-8111-111111111111" },
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
        sendEmail: false,
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mocks.scheduleInterview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Introduction to Syntrix",
        sendEmail: false,
      }),
    );
  });

  it("rejects prepare and confirm of applyAutomationProposal when actor lacks automations:manage", async () => {
    mocks.getActorPermissions.mockResolvedValue([
      "candidates:view", "collab:write", "tasks:read", "tasks:write",
    ]);
    const proposalId = "11111111-1111-4111-8111-111111111111";

    await expect(
      prepareAgentWriteAction("applyAutomationProposal", { proposalId }),
    ).resolves.toEqual({
      ok: false,
      title: "Action unauthorized",
      details: [],
      error: "You do not have permission to perform this action.",
    });
    expect(mocks.getAutomationProposal).not.toHaveBeenCalled();

    await expect(
      confirmAgentWriteAction("applyAutomationProposal", { proposalId }),
    ).resolves.toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
    });
    expect(mocks.applyAutomationProposal).not.toHaveBeenCalled();
  });

  it("rejects createOffer when actor lacks offers:manage", async () => {
    mocks.getActorPermissions.mockResolvedValue([
      "candidates:view", "collab:write", "tasks:read", "tasks:write",
    ]);

    await expect(
      confirmAgentWriteAction("createOffer", {
        applicationId: "11111111-1111-4111-8111-111111111111",
        salary: 100000,
        currency: "USD",
        startDate: "2026-10-01",
      }),
    ).resolves.toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
    });
  });
});

const APP_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";
const OFFER_ID = "66666666-6666-4666-8666-666666666666";
const INTERVIEW_ID = "77777777-7777-4777-8777-777777777777";

describe("AI write results name the records they changed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1" },
      roleKey: "owner",
    });
    mocks.getActorPermissions.mockResolvedValue([
      "jobs:create", "jobs:view", "candidates:view", "candidates:edit", "candidates:move",
      "candidates:delete", "collab:write", "interviews:manage", "interviews:feedback", "tasks:read",
      "tasks:write", "offers:manage", "offers:approve", "automations:manage", "reports:read",
    ]);
    mocks.getApplicationForApi.mockResolvedValue({ currentStageId: STAGE_ID });
    mocks.moveApplicationStage.mockResolvedValue({ success: true });
    mocks.createTask.mockResolvedValue({ success: true, taskId: TASK_ID, updatedAt: "2026-07-20T03:00:00.000Z" });
    mocks.updateTask.mockResolvedValue({ success: true });
    mocks.scheduleInterview.mockResolvedValue({ success: true, interviewId: INTERVIEW_ID });
    mocks.verifyInterviewOutcome.mockResolvedValue({ persisted: true, outcomeStatus: "complete", syncs: [], warnings: [] });
    mocks.setInterviewStatus.mockResolvedValue({ success: true });
    mocks.addToPoolAction.mockResolvedValue({ success: true });
    mocks.createScorecard.mockResolvedValue({ success: true });
    mocks.getAgentActionReceipt.mockResolvedValue(null);
    vi.mocked(updateApplicationStatus).mockResolvedValue({ success: true });
    vi.mocked(createJobForApi).mockResolvedValue({ id: JOB_ID, title: "Platform engineer", slug: "platform-engineer" } as never);
    vi.mocked(requirePermission).mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1", email: "owner@example.test" },
    } as never);
    vi.mocked(createCandidateNote).mockResolvedValue({ success: true });
    vi.mocked(addCandidateTag).mockResolvedValue({ success: true });
    vi.mocked(createScorecard).mockResolvedValue({ success: true });
    vi.mocked(createOffer).mockResolvedValue({ success: true });
    vi.mocked(sendOffer).mockResolvedValue({ success: true });
    vi.mocked(decideOffer).mockResolvedValue({ success: true });
    vi.mocked(addToPoolAction).mockResolvedValue({ success: true });
    vi.mocked(assignFromPoolToJobAction).mockResolvedValue({ success: true });
    vi.mocked(bulkGenerateAiEvaluationsForJobAction).mockResolvedValue({
      success: true,
      succeeded: 2,
      failed: 0,
      remaining: 0,
    } as never);
  });

  it.each([
    [
      "moveCandidateStage",
      { applicationId: APP_ID, toStageId: STAGE_ID },
      { applicationId: APP_ID },
    ],
    ["rejectCandidate", { applicationId: APP_ID }, { applicationId: APP_ID }],
    [
      "createTask",
      { title: "Follow up", priority: "medium", jobId: JOB_ID, candidateId: null, applicationId: null },
      { taskId: TASK_ID, jobId: JOB_ID },
    ],
    ["updateTask", { taskId: TASK_ID, status: "completed" }, { taskId: TASK_ID }],
    [
      "createJob",
      {
        title: "Platform engineer",
        jobSummary: "Build and run the hiring platform services.",
        sections: [
          { title: "Responsibilities", bullets: ["Ship features"] },
          { title: "Requirements", bullets: ["Relevant experience"] },
        ],
        department: "Engineering",
        location: null,
        employmentType: "full_time",
        workplaceType: "remote",
        experienceLevel: null,
        keywords: [],
      },
      { jobId: JOB_ID },
    ],
    ["addCandidateNote", { candidateId: CANDIDATE_ID, body: "Strong phone screen" }, { candidateId: CANDIDATE_ID }],
    ["addCandidateTag", { candidateId: CANDIDATE_ID, label: "referral" }, { candidateId: CANDIDATE_ID }],
    [
      "createOffer",
      {
        applicationId: APP_ID,
        title: "Staff engineer",
        salaryAmount: null,
        currency: null,
        salaryPeriod: null,
        equity: null,
        startDate: null,
        expiresAt: null,
        notes: null,
      },
      { applicationId: APP_ID },
    ],
    ["sendOffer", { offerId: OFFER_ID }, { offerId: OFFER_ID }],
    ["decideOffer", { offerId: OFFER_ID, decision: "accepted" }, { offerId: OFFER_ID }],
    [
      "scheduleInterview",
      {
        candidateId: CANDIDATE_ID,
        applicationId: APP_ID,
        type: "screening",
        mode: "video",
        scheduledAt: "2026-07-21T13:00:00.000Z",
        interviewerId: null,
        durationMins: 45,
        meetingProvider: "auto",
        sendEmail: true,
      },
      { interviewId: INTERVIEW_ID, candidateId: CANDIDATE_ID, applicationId: APP_ID },
    ],
    ["addToTalentPool", { candidateId: CANDIDATE_ID }, { candidateId: CANDIDATE_ID }],
    [
      "assignFromPoolToJob",
      { candidateId: CANDIDATE_ID, jobId: JOB_ID },
      { candidateId: CANDIDATE_ID, jobId: JOB_ID },
    ],
    [
      "createScorecard",
      { candidateId: CANDIDATE_ID, applicationId: APP_ID, rating: "strong" },
      { candidateId: CANDIDATE_ID, applicationId: APP_ID },
    ],
    ["bulkScoreJob", { jobId: JOB_ID, jobTitle: "Platform engineer" }, { jobId: JOB_ID }],
  ])("%s returns the record ids its result changed", async (tool, input, targets) => {
    await expect(confirmAgentWriteAction(tool, input)).resolves.toMatchObject({
      targets,
    });
  });

  it("names the record a stage-move undo reverses", async () => {
    mocks.getAgentActionReceipt.mockResolvedValue({
      toolName: "moveCandidateStage",
      result: {
        success: true,
        undo: {
          kind: "moveCandidateStage",
          applicationId: APP_ID,
          expectedCurrentStageId: STAGE_ID,
          previousStageId: "99999999-9999-4999-8999-999999999999",
        },
      },
    });
    mocks.reserveAgentAction.mockResolvedValue({
      kind: "reserved",
      receiptId: "undo-receipt-2",
      complete: vi.fn().mockResolvedValue(undefined),
    });
    mocks.moveApplicationStage.mockResolvedValue({ success: true });

    await expect(undoAgentWriteAction("receipt-2")).resolves.toMatchObject({
      success: true,
      targets: { applicationId: APP_ID },
    });
  });
});
