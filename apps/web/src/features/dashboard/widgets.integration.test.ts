import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, jobStages, tasks } from "@harly/db";

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

import {
  getCandidatesNeedingReview,
  getDashboardWidgetAccess,
  getHiringPerformance,
  getInbox,
  getJobsAtRisk,
  getMyDashboardTasks,
  getPipelineOverview,
  getTodayInterviews,
} from "./widgets";

describe.skipIf(!runPipelineIntegration)("dashboard widgets: permission and scope (database)", () => {
  let fx: AuthorizationFixture;
  const taskTitle = `Scoped task ${randomUUID().slice(0, 8)}`;

  function actAs(key: ActorKey | "owner") {
    ctx.workspaceId = fx.workspaceId;
    if (key === "owner") {
      ctx.userId = fx.users.full;
      ctx.roleKey = "owner";
      return;
    }
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    await db.insert(tasks).values({
      workspaceId: fx.workspaceId,
      title: taskTitle,
      ownerId: fx.users.scoped,
      createdById: fx.users.scoped,
      status: "pending",
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  beforeEach(() => {
    ctx.workspaceId = fx.workspaceId;
  });

  it("omits each home widget the caller cannot see", async () => {
    actAs("plain");
    await expect(getDashboardWidgetAccess()).resolves.toEqual({
      reviewCandidates: false,
      todayInterviews: false,
      scheduling: false,
      pipeline: false,
      approvals: false,
      tasks: false,
      performance: false,
    });

    actAs("scoped");
    await expect(getDashboardWidgetAccess()).resolves.toEqual({
      reviewCandidates: true,
      todayInterviews: true,
      scheduling: false,
      pipeline: true,
      approvals: true,
      tasks: true,
      // Canonical metrics are workspace-wide, so a restricted caller never sees them.
      performance: false,
    });

    actAs("full");
    await expect(getDashboardWidgetAccess()).resolves.toMatchObject({ performance: true });
  });

  it("review widget: unauthorized gets nothing, scoped sees in-scope applications only", async () => {
    actAs("plain");
    await expect(getCandidatesNeedingReview()).resolves.toEqual({
      total: 0,
      waitingOverWeek: 0,
      items: [],
    });

    actAs("scoped");
    const scoped = await getCandidatesNeedingReview();
    expect(scoped.items.map((row) => row.candidateId)).toEqual([fx.candidateA]);
    // The count is the real total, not the number of rows shown.
    expect(scoped.total).toBe(scoped.items.length);

    actAs("full");
    const full = (await getCandidatesNeedingReview()).items.map((row) => row.candidateId);
    expect(full).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateB]));
  });

  it("interviews widget: unauthorized gets nothing, scoped sees interviews on assigned jobs", async () => {
    actAs("plain");
    await expect(getTodayInterviews()).resolves.toMatchObject({ total: 0, items: [] });

    actAs("scoped");
    await expect(getTodayInterviews()).resolves.toMatchObject({ total: 1 });

    actAs("full");
    await expect(getTodayInterviews()).resolves.toMatchObject({ total: 2 });
  });

  it("pipeline widget: unauthorized gets an empty overview, scoped sees assigned open jobs only", async () => {
    actAs("plain");
    await expect(getPipelineOverview()).resolves.toMatchObject({ jobs: [], selected: null });

    actAs("scoped");
    const scoped = await getPipelineOverview();
    const scopedJobIds = scoped.jobs.map((job) => job.id);
    expect(scopedJobIds).toEqual(expect.arrayContaining([fx.jobA, fx.jobAssignedEmpty]));
    expect(scopedJobIds).not.toContain(fx.jobB);
    expect(scopedJobIds).not.toContain(fx.jobUnassignedEmpty);
    expect(scoped.selected?.id).not.toBe(fx.jobB);

    actAs("full");
    const full = await getPipelineOverview(fx.jobB);
    expect(full.jobs.map((job) => job.id)).toEqual(expect.arrayContaining([fx.jobB, fx.jobUnassignedEmpty]));
    expect(full.selected?.id).toBe(fx.jobB);
  });

  it("pipeline stages exclude archived stages", async () => {
    actAs("full");
    const overview = await getPipelineOverview(fx.jobA);
    expect(overview.stages.map((stage) => stage.name)).not.toContain(fx.archivedStageName);
  });

  it("funnel hides the rejected lane by stage kind, not by its name", async () => {
    // Job with no applications, so the lane changes are isolated to this test.
    const [rejectedLane] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.jobId, fx.jobUnassignedEmpty),
          eq(jobStages.kind, "rejected"),
        ),
      );
    await db.update(jobStages).set({ name: "Not a fit" }).where(eq(jobStages.id, rejectedLane!.id));
    await db.insert(jobStages).values({
      workspaceId: fx.workspaceId,
      jobId: fx.jobUnassignedEmpty,
      name: "Rejected",
      kind: "custom",
      order: 90,
    });

    actAs("full");
    const names = (await getPipelineOverview(fx.jobUnassignedEmpty)).stages.map((stage) => stage.name);
    expect(names).not.toContain("Not a fit");
    expect(names).toContain("Rejected");
  });

  it("decisions waiting: unauthorized gets nothing, draft approvals need the job in scope", async () => {
    actAs("plain");
    await expect(getInbox()).resolves.toEqual({ total: 0, items: [] });

    actAs("scoped");
    const scoped = await getInbox();
    expect(scoped.items.map((item) => item.id)).not.toContain(fx.jobDraft);

    actAs("full");
    const full = await getInbox();
    expect(full.items.map((item) => item.id)).toContain(fx.jobDraft);
    expect(full.total).toBeGreaterThanOrEqual(full.items.length);
  });

  it("tasks widget: unauthorized gets nothing, the owner sees their own task", async () => {
    actAs("plain");
    await expect(getMyDashboardTasks()).resolves.toEqual({ total: 0, dueNow: 0, items: [] });

    actAs("scoped");
    const mine = await getMyDashboardTasks();
    expect(mine.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: taskTitle })]),
    );
    expect(mine.total).toBeGreaterThanOrEqual(mine.items.length);
  });

  it("hiring performance: unauthorized and restricted callers are refused, unrestricted callers see it", async () => {
    actAs("plain");
    await expect(getHiringPerformance()).rejects.toThrow("You do not have access to hiring performance.");

    actAs("scoped");
    await expect(getHiringPerformance()).rejects.toThrow("You do not have access to hiring performance.");

    actAs("full");
    await expect(getHiringPerformance()).resolves.toMatchObject({ rangeLabel: "Last 14 days" });
  });

  it("jobs at risk: unauthorized gets nothing, scoped sees assigned jobs only", async () => {
    actAs("plain");
    await expect(getJobsAtRisk()).resolves.toEqual([]);

    actAs("scoped");
    const scoped = (await getJobsAtRisk()).map((job) => job.id);
    expect(scoped).toContain(fx.jobAssignedEmpty);
    expect(scoped).not.toContain(fx.jobUnassignedEmpty);

    actAs("full");
    const full = (await getJobsAtRisk()).map((job) => job.id);
    expect(full).toEqual(expect.arrayContaining([fx.jobAssignedEmpty, fx.jobUnassignedEmpty]));
  });
});
