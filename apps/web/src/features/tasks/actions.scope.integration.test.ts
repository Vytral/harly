import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { customRoles, db, interviews, member, tasks } from "@harly/db";

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/server/events/emit", () => ({
  emitRealtimeInvalidation: vi.fn(async () => undefined),
  persistDomainEvent: vi.fn(async () => ({ payload: {} })),
  publishPersistedDomainEvents: vi.fn(async () => undefined),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(async () => undefined),
  webhookOptionsAfterPersist: vi.fn(() => ({})),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import { createTask, deleteTask, updateTask } from "./actions";

const TASK_PERMISSIONS = ["candidates:view", "jobs:view", "tasks:read", "tasks:write"] as const;

describe.skipIf(!runPipelineIntegration)("task writes respect task and link scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedRoleKey: string;
  let fullRoleKey: string;
  let interviewOnB: string;
  let taskOnB: string;
  const tag = randomUUID().slice(0, 8);

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = key === "scoped" ? scopedRoleKey : fullRoleKey;
  }

  async function titleOf(taskId: string) {
    const [row] = await db
      .select({ title: tasks.title, jobId: tasks.jobId, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    return row;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    scopedRoleKey = `task-scoped-${tag}`;
    fullRoleKey = `task-full-${tag}`;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: scopedRoleKey,
        name: "Task writer, assigned jobs",
        permissions: [...TASK_PERMISSIONS],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: fullRoleKey,
        name: "Task writer, all jobs",
        permissions: [...TASK_PERMISSIONS],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);
    await db.insert(member).values([
      { id: `task-member-s-${tag}`, organizationId: fx.workspaceId, userId: fx.users.scoped, role: scopedRoleKey, createdAt: new Date(), updatedAt: new Date() },
      { id: `task-member-f-${tag}`, organizationId: fx.workspaceId, userId: fx.users.full, role: fullRoleKey, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const [interview] = await db
      .select({ id: interviews.id })
      .from(interviews)
      .where(and(eq(interviews.workspaceId, fx.workspaceId), eq(interviews.applicationId, fx.applicationAB.onB)))
      .limit(1);
    interviewOnB = interview!.id;
    const base = { workspaceId: fx.workspaceId, ownerId: fx.users.full, createdById: fx.users.full };
    const [b] = await db
      .insert(tasks)
      .values([
        { ...base, title: "Task on B", jobId: fx.jobB },
      ])
      .returning({ id: tasks.id });
    taskOnB = b!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("refuses to create a task linked to an out-of-scope job", async () => {
    actAs("scoped");
    const result = await createTask({
      title: "Linked to B job",
      ownerId: fx.users.scoped,
      jobId: fx.jobB,
    });
    expect(result.success).toBe(false);
  });

  it("refuses to create a task linked to an out-of-scope candidate", async () => {
    actAs("scoped");
    const result = await createTask({
      title: "Linked to B candidate",
      ownerId: fx.users.scoped,
      candidateId: fx.candidateB,
    });
    expect(result.success).toBe(false);
  });

  it("refuses to create a task linked to an out-of-scope application", async () => {
    actAs("scoped");
    const result = await createTask({
      title: "Linked to B application",
      ownerId: fx.users.scoped,
      applicationId: fx.applicationAB.onB,
    });
    expect(result.success).toBe(false);
  });

  it("refuses to create a task linked to an out-of-scope interview", async () => {
    actAs("scoped");
    const result = await createTask({
      title: "Linked to B interview",
      ownerId: fx.users.scoped,
      interviewId: interviewOnB,
    });
    expect(result.success).toBe(false);
  });

  it("allows creating a task linked to an in-scope job or left unlinked", async () => {
    actAs("scoped");
    const linked = await createTask({ title: "Linked to A job", ownerId: fx.users.scoped, jobId: fx.jobA });
    const unlinked = await createTask({ title: "Unlinked", ownerId: fx.users.scoped });
    expect(linked.success).toBe(true);
    expect(unlinked.success).toBe(true);
  });

  it("refuses to update a task the caller cannot see", async () => {
    actAs("scoped");
    const result = await updateTask({ taskId: taskOnB, title: "Renamed by scoped" });
    expect(result.success).toBe(false);
    expect((await titleOf(taskOnB))?.title).toBe("Task on B");
  });

  it("refuses to move a visible task onto an out-of-scope job", async () => {
    actAs("scoped");
    const owned = await createTask({ title: "Mine", ownerId: fx.users.scoped, jobId: fx.jobA });
    expect(owned.success).toBe(true);
    const result = await updateTask({ taskId: owned.taskId!, jobId: fx.jobB });
    expect(result.success).toBe(false);
    expect((await titleOf(owned.taskId!))?.jobId).toBe(fx.jobA);
  });

  it("refuses to delete a task the caller cannot see", async () => {
    actAs("scoped");
    const result = await deleteTask(taskOnB);
    expect(result.success).toBe(false);
    expect((await titleOf(taskOnB))?.deletedAt).toBeNull();
  });

  it("lets an unrestricted caller update and delete the same out-of-scope task", async () => {
    actAs("full");
    const [own] = await db
      .insert(tasks)
      .values({ workspaceId: fx.workspaceId, title: "Full-only task", ownerId: fx.users.full, createdById: fx.users.full, jobId: fx.jobB })
      .returning({ id: tasks.id });
    const updated = await updateTask({ taskId: own!.id, title: "Renamed by full" });
    expect(updated.success).toBe(true);
    expect((await titleOf(own!.id))?.title).toBe("Renamed by full");
    const deleted = await deleteTask(own!.id);
    expect(deleted.success).toBe(true);
  });
});
