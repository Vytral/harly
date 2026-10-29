import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  aiActionReceipts,
  applications,
  candidateNotes,
  customRoles,
  db,
  jobs,
  member,
  tasks,
} from "@harly/db";

import {
  createAuthorizationFixture,
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

import { confirmAgentWriteAction, prepareAgentWriteAction, undoAgentWriteAction } from "./write-actions";

describe.skipIf(!runPipelineIntegration)("AI write tools respect job, candidate and task scope (database)", () => {
  let fx: AuthorizationFixture;
  let deptRoleKey: string;
  let regionRoleKey: string;
  let writerRoleKey: string;
  let writerAllRoleKey: string;
  let applicationOnB: string;
  let taskOnB: string;
  let taskOnA: string;
  const tag = randomUUID().slice(0, 8);

  const WRITE_PERMISSIONS = [
    "candidates:view",
    "candidates:edit",
    "candidates:move",
    "jobs:view",
    "tasks:read",
    "tasks:write",
    "collab:write",
    "interviews:feedback",
    "reports:read",
  ] as const;

  /**
   * writer: job-limited (assigned to job A), with every permission the write
   * tools need. writerAll: the same permissions, unrestricted. dept: may create
   * jobs, limited to the Engineering department.
   */
  type Caller = "writer" | "writerAll" | "dept" | "region";

  function actAs(caller: Caller) {
    ctx.workspaceId = fx.workspaceId;
    if (caller === "writer") {
      ctx.userId = fx.users.scoped;
      ctx.roleKey = writerRoleKey;
    } else if (caller === "writerAll") {
      ctx.userId = fx.users.full;
      ctx.roleKey = writerAllRoleKey;
    } else if (caller === "region") {
      ctx.userId = fx.users.plain;
      ctx.roleKey = regionRoleKey;
    } else {
      ctx.userId = fx.users.plain;
      ctx.roleKey = deptRoleKey;
    }
  }

  async function noteCount(candidateId: string) {
    const rows = await db.select({ id: candidateNotes.id }).from(candidateNotes).where(eq(candidateNotes.candidateId, candidateId));
    return rows.length;
  }

  async function taskStatus(taskId: string) {
    const [row] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
    return row?.status;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    deptRoleKey = `dept-${tag}`;
    regionRoleKey = `region-${tag}`;
    writerRoleKey = `writer-${tag}`;
    writerAllRoleKey = `writer-all-${tag}`;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: deptRoleKey,
        name: "Engineering only",
        permissions: ["jobs:create", "jobs:view", "candidates:view", "collab:write"],
        scope: { jobAccess: "all", departments: ["Engineering"], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: regionRoleKey,
        name: "EMEA only",
        permissions: ["jobs:create", "jobs:view", "candidates:view", "collab:write"],
        scope: { jobAccess: "all", departments: [], regions: ["EMEA"] },
      },
      {
        workspaceId: fx.workspaceId,
        key: writerRoleKey,
        name: "Writer, assigned jobs",
        permissions: [...WRITE_PERMISSIONS],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: writerAllRoleKey,
        name: "Writer, all jobs",
        permissions: [...WRITE_PERMISSIONS],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);

    const membership = (userId: string, role: string) => ({
      id: `member-${userId}-${tag}`,
      organizationId: fx.workspaceId,
      userId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Task owners must be members of the workspace. Each caller's role is the
    // one its session resolves to, so the membership role matches it.
    await db.insert(member).values([
      membership(fx.users.scoped, writerRoleKey),
      membership(fx.users.full, writerAllRoleKey),
      membership(fx.users.plain, deptRoleKey),
    ]);

    const [application] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.candidateId, fx.candidateB), eq(applications.workspaceId, fx.workspaceId)))
      .limit(1);
    applicationOnB = application.id;

    const base = { workspaceId: fx.workspaceId, status: "pending" as const, priority: "medium" as const, createdById: fx.users.full, ownerId: fx.users.full };
    const [onB] = await db.insert(tasks).values({ ...base, title: `task-b-${tag}`, jobId: fx.jobB }).returning({ id: tasks.id });
    const [onA] = await db.insert(tasks).values({ ...base, title: `task-a-${tag}`, jobId: fx.jobA }).returning({ id: tasks.id });
    taskOnB = onB.id;
    taskOnA = onA.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("previews nothing about an application outside the caller's scope", async () => {
    actAs("writer");
    const preview = await prepareAgentWriteAction("moveCandidateStage", {
      applicationId: applicationOnB,
      toStageId: fx.stagesB.hired!.id,
    });
    expect(preview.ok).toBe(false);
    expect(JSON.stringify(preview)).not.toContain(fx.names.candidateB);
  });

  it("still previews an application inside the caller's scope", async () => {
    actAs("writerAll");
    const preview = await prepareAgentWriteAction("moveCandidateStage", {
      applicationId: applicationOnB,
      toStageId: fx.stagesB.hired!.id,
    });
    expect(preview.ok).toBe(true);
    expect(JSON.stringify(preview)).toContain(fx.names.candidateB);
  });

  it("does not add a note to a candidate outside the caller's scope", async () => {
    actAs("writer");
    const before = await noteCount(fx.candidateB);
    const result = await confirmAgentWriteAction("addCandidateNote", {
      candidateId: fx.candidateB,
      body: "Written through the agent",
    });
    expect(result.success).toBe(false);
    expect(await noteCount(fx.candidateB)).toBe(before);
  });

  it("adds a note to a candidate inside the caller's scope", async () => {
    actAs("writer");
    const before = await noteCount(fx.candidateA);
    const result = await confirmAgentWriteAction("addCandidateNote", {
      candidateId: fx.candidateA,
      body: "Written through the agent",
    });
    expect(result.success).toBe(true);
    expect(await noteCount(fx.candidateA)).toBe(before + 1);
  });

  it("does not create a task linked to a job outside the caller's scope", async () => {
    actAs("writer");
    const title = `Linked elsewhere ${tag}`;
    const result = await confirmAgentWriteAction("createTask", {
      title,
      jobId: fx.jobB,
      priority: "medium",
    });
    expect(result.success).toBe(false);
    const created = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.title, title));
    expect(created).toHaveLength(0);
  });

  it("creates a task linked to a job inside the caller's scope", async () => {
    actAs("writer");
    const result = await confirmAgentWriteAction("createTask", {
      title: `Linked to A ${tag}`,
      jobId: fx.jobA,
      priority: "medium",
    });
    expect(result.success).toBe(true);
  });

  it("updates a task linked to a job inside the caller's scope", async () => {
    actAs("writer");
    const result = await confirmAgentWriteAction("updateTask", { taskId: taskOnA, status: "completed" });
    expect(result.success).toBe(true);
    expect(await taskStatus(taskOnA)).toBe("completed");
  });

  it("does not update a task linked to a job outside the caller's scope", async () => {
    actAs("writer");
    const result = await confirmAgentWriteAction("updateTask", { taskId: taskOnB, status: "completed" });
    expect(result.success).toBe(false);
    expect(await taskStatus(taskOnB)).toBe("pending");
  });

  it("does not undo the deletion of a task outside the caller's scope", async () => {
    actAs("writer");
    // The receipt carries the task's current updatedAt, so the only reason an
    // undo can fail here is the scope check, not a stale-version conflict.
    const [taskRow] = await db.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, taskOnB));
    const [receipt] = await db
      .insert(aiActionReceipts)
      .values({
        workspaceId: fx.workspaceId,
        actorId: fx.users.scoped,
        actionId: `scope-undo-${tag}`,
        toolName: "createTask",
        requestHash: `hash-${tag}`,
        status: "completed",
        result: {
          success: true,
          undo: { kind: "deleteTask", taskId: taskOnB, expectedUpdatedAt: taskRow.updatedAt.toISOString() },
        },
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning({ id: aiActionReceipts.id });
    const result = await undoAgentWriteAction(receipt.id);
    expect(result.success).toBe(false);
    const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskOnB));
    expect(row).toBeDefined();
  });

  it("does not create a job in a department outside the caller's scope", async () => {
    actAs("dept");
    const result = await confirmAgentWriteAction("createJob", jobInput(`Sales hire ${tag}`, "Sales"));
    expect(result.success).toBe(false);
    const created = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.title, `Sales hire ${tag}`));
    expect(created).toHaveLength(0);
  });

  it("does not create a job for a role limited to regions, since the agent cannot set one", async () => {
    actAs("region");
    const title = `Region hire ${tag}`;
    const result = await confirmAgentWriteAction("createJob", jobInput(title, "Engineering"));
    expect(result.success).toBe(false);
    const created = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.title, title));
    expect(created).toHaveLength(0);
  });

  it("creates a job inside the caller's department scope", async () => {
    actAs("dept");
    const result = await confirmAgentWriteAction("createJob", jobInput(`Eng hire ${tag}`, "engineering"));
    expect(result.success).toBe(true);
  });
});

function jobInput(title: string, department: string) {
  return {
    title,
    jobSummary: "Build and run the hiring platform services.",
    sections: [
      { title: "Responsibilities", bullets: ["Ship features"] },
      { title: "Requirements", bullets: ["Relevant experience"] },
    ],
    department,
    location: null,
    employmentType: "full_time",
    workplaceType: "remote",
    experienceLevel: null,
    keywords: [],
  };
}
