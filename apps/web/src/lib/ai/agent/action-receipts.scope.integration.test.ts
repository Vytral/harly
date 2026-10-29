import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { aiActionReceipts, customRoles, db, interviews, tasks } from "@harly/db";
import { eq } from "drizzle-orm";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
}));

import { listAgentActionReceipts } from "./action-receipts";

describe.skipIf(!runPipelineIntegration)("agent action receipts respect record scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedRoleKey: string;
  let fullRoleKey: string;
  let taskOnB: string;
  let interviewOnB: string;
  const tag = randomUUID().slice(0, 8);

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = key === "scoped" ? scopedRoleKey : fullRoleKey;
  }

  async function receipt(
    label: string,
    toolName: string,
    result: Record<string, unknown>,
  ) {
    await db.insert(aiActionReceipts).values({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      actionId: `${label}-${tag}`,
      toolName,
      requestHash: randomUUID(),
      status: result.success ? "completed" : "failed",
      result,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    scopedRoleKey = `receipt-scoped-${tag}`;
    fullRoleKey = `receipt-full-${tag}`;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: scopedRoleKey,
        name: "Assistant, assigned jobs",
        permissions: ["candidates:view", "jobs:view", "tasks:read", "tasks:write"],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: fullRoleKey,
        name: "Assistant, all jobs",
        permissions: ["candidates:view", "jobs:view", "tasks:read", "tasks:write"],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);
    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: fx.workspaceId,
        title: "Task on B",
        ownerId: fx.users.full,
        createdById: fx.users.full,
        jobId: fx.jobB,
      })
      .returning({ id: tasks.id });
    taskOnB = task!.id;
    const [interview] = await db
      .select({ id: interviews.id })
      .from(interviews)
      .where(eq(interviews.applicationId, fx.applicationAB.onB))
      .limit(1);
    interviewOnB = interview!.id;

    await receipt("create-job", "createJob", {
      success: true,
      message: "Draft job created: Confidential Role.",
    });
    await receipt("stage-a", "moveCandidate", {
      success: true,
      message: "Stage updated.",
      undo: {
        kind: "moveCandidateStage",
        applicationId: fx.applicationAB.onA,
        expectedCurrentStageId: fx.stagesA.applied!.id,
        previousStageId: fx.stagesA.screening!.id,
      },
    });
    await receipt("stage-b", "moveCandidate", {
      success: true,
      message: "Stage updated for Shared Person.",
      undo: {
        kind: "moveCandidateStage",
        applicationId: fx.applicationAB.onB,
        expectedCurrentStageId: fx.stagesB.screening!.id,
        previousStageId: fx.stagesB.applied!.id,
      },
    });
    await receipt("task-b", "createTask", {
      success: true,
      message: "Task created.",
      undo: { kind: "deleteTask", taskId: taskOnB, expectedUpdatedAt: new Date().toISOString() },
    });
    await receipt("interview-b", "scheduleInterview", {
      success: true,
      message: "Interview scheduled.",
      undo: {
        kind: "cancelInterview",
        interviewId: interviewOnB,
        candidateId: fx.candidateAB,
        expectedStatus: "scheduled",
      },
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("keeps every receipt message for an unrestricted caller", async () => {
    // Same user as the receipts' author, but with the unrestricted role.
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users.scoped;
    ctx.roleKey = fullRoleKey;
    const rows = await listAgentActionReceipts({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      limit: 20,
    });
    const messages = rows.map((row) => row.message);
    expect(messages).toContain("Draft job created: Confidential Role.");
    expect(messages).toContain("Stage updated for Shared Person.");
  });

  it("does not show a job title from a receipt whose target the scoped caller cannot resolve", async () => {
    actAs("scoped");
    const rows = await listAgentActionReceipts({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      limit: 20,
    });
    const createJob = rows.find((row) => row.toolName === "createJob");
    expect(createJob).toBeDefined();
    expect(createJob!.message).not.toContain("Confidential Role");
    expect(createJob!.success).toBe(true);
  });

  it("keeps the message and undo for a receipt on a record inside the caller's scope", async () => {
    actAs("scoped");
    const rows = await listAgentActionReceipts({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      limit: 20,
    });
    const inScope = rows.find((row) => row.message === "Stage updated.");
    expect(inScope).toBeDefined();
    expect(inScope!.undoable).toBe(true);
  });

  it("generic-izes a receipt whose application is outside the caller's scope", async () => {
    actAs("scoped");
    const rows = await listAgentActionReceipts({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      limit: 20,
    });
    expect(rows.some((row) => row.message === "Stage updated for Shared Person.")).toBe(false);
    const hidden = rows.filter((row) => row.toolName === "moveCandidate" && row.undoable === false);
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("generic-izes receipts that undo a task or interview outside the caller's scope", async () => {
    actAs("scoped");
    const rows = await listAgentActionReceipts({
      workspaceId: fx.workspaceId,
      actorId: fx.users.scoped,
      limit: 20,
    });
    const task = rows.find((row) => row.toolName === "createTask");
    const interview = rows.find((row) => row.toolName === "scheduleInterview");
    expect(task?.undoable).toBe(false);
    expect(interview?.undoable).toBe(false);
    expect(interview?.message).not.toBe("Interview scheduled.");
  });
});
