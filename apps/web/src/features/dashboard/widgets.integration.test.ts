import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { db, tasks } from "@harly/db";

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
      pipeline: false,
      inbox: false,
      tasks: false,
      performance: false,
    });

    actAs("scoped");
    await expect(getDashboardWidgetAccess()).resolves.toEqual({
      reviewCandidates: true,
      todayInterviews: true,
      pipeline: true,
      inbox: true,
      tasks: true,
      // Canonical metrics are workspace-wide, so a restricted caller never sees them.
      performance: false,
    });

    actAs("full");
    await expect(getDashboardWidgetAccess()).resolves.toMatchObject({ performance: true });
  });

  it("review widget: unauthorized gets nothing, scoped sees in-scope applications only", async () => {
    actAs("plain");
    await expect(getCandidatesNeedingReview()).resolves.toEqual([]);

    actAs("scoped");
    const scoped = await getCandidatesNeedingReview();
    expect(scoped.map((row) => row.candidateId)).toEqual([fx.candidateA]);

    actAs("full");
    const full = (await getCandidatesNeedingReview()).map((row) => row.candidateId);
    expect(full).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateB]));
  });

  it("interviews widget: unauthorized gets nothing, scoped sees interviews on assigned jobs", async () => {
    actAs("plain");
    await expect(getTodayInterviews()).resolves.toEqual([]);

    actAs("scoped");
    await expect(getTodayInterviews()).resolves.toHaveLength(1);

    actAs("full");
    await expect(getTodayInterviews()).resolves.toHaveLength(2);
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

  it("inbox: unauthorized gets nothing, scoped sees in-scope items, draft approvals need the job in scope", async () => {
    actAs("plain");
    await expect(getInbox()).resolves.toEqual([]);

    actAs("scoped");
    const scoped = (await getInbox()).map((item) => item.title);
    expect(scoped).toContain(`Send feedback for ${fx.names.candidateA}`);
    expect(scoped.join("|")).not.toContain(fx.names.candidateB);
    expect(scoped.join("|")).not.toContain(fx.names.candidateAB);
    const scopedApprovals = (await getInbox()).map((item) => item.id);
    expect(scopedApprovals).not.toContain(`${fx.jobDraft}-approve`);

    actAs("full");
    const full = await getInbox();
    expect(full.map((item) => item.title).join("|")).toContain(fx.names.candidateB);
    expect(full.map((item) => item.id)).toContain(`${fx.jobDraft}-approve`);
  });

  it("tasks widget: unauthorized gets nothing, the owner sees their own task", async () => {
    actAs("plain");
    await expect(getMyDashboardTasks()).resolves.toEqual([]);

    actAs("scoped");
    await expect(getMyDashboardTasks()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: taskTitle })]),
    );
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
