import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { aiEvaluations, db, offers, tasks } from "@harly/db";

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
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import { buildReadTools } from "./tools";

const EXECUTION = { toolCallId: "tools-scope-test", messages: [] };

describe.skipIf(!runPipelineIntegration)("Harly AI read tools respect role scope (database)", () => {
  let fx: AuthorizationFixture;
  const taskTitles = {
    onJobA: `task-on-a-${randomUUID().slice(0, 6)}`,
    onJobB: `task-on-b-${randomUUID().slice(0, 6)}`,
    scopedOwn: `task-mine-${randomUUID().slice(0, 6)}`,
    unlinkedOther: `task-other-${randomUUID().slice(0, 6)}`,
  };
  let scoredAppOnA: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  function tools(key: ActorKey) {
    return buildReadTools({ workspaceId: fx.workspaceId, userId: fx.users[key] });
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const base = { workspaceId: fx.workspaceId, status: "pending" as const, priority: "medium" as const, createdById: fx.users.full };
    await db.insert(tasks).values([
      { ...base, title: taskTitles.onJobA, ownerId: fx.users.full, jobId: fx.jobA },
      { ...base, title: taskTitles.onJobB, ownerId: fx.users.full, jobId: fx.jobB },
      { ...base, title: taskTitles.scopedOwn, ownerId: fx.users.scoped, createdById: fx.users.scoped },
      { ...base, title: taskTitles.unlinkedOther, ownerId: fx.users.full },
    ]);

    const evaluation = (applicationId: string, jobId: string, score: number) => ({
      workspaceId: fx.workspaceId,
      candidateId: fx.candidateAB,
      applicationId,
      jobId,
      provider: "test",
      modelId: "test-model",
      score,
      recommendation: "maybe" as const,
      summary: `Summary ${score}`,
      strengths: [],
      gaps: [],
      criteria: [],
      usedResume: false,
    });
    scoredAppOnA = fx.applicationAB.onA;
    await db.insert(aiEvaluations).values([
      evaluation(fx.applicationAB.onA, fx.jobA, 71),
      evaluation(fx.applicationAB.onB, fx.jobB, 42),
    ]);

    await db.insert(offers).values([
      { workspaceId: fx.workspaceId, applicationId: fx.applicationAB.onA, candidateId: fx.candidateAB, jobId: fx.jobA, status: "draft", title: "Offer on A", createdById: fx.users.full },
      { workspaceId: fx.workspaceId, applicationId: fx.applicationAB.onB, candidateId: fx.candidateAB, jobId: fx.jobB, status: "draft", title: "Offer on B", createdById: fx.users.full },
    ]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  beforeEach(() => {
    ctx.workspaceId = fx.workspaceId;
  });

  it("lists only tasks inside the caller's scope to a scoped caller", async () => {
    actAs("scoped");
    const output = (await tools("scoped").listTasks.execute!(
      { status: null, offset: 0, limit: 50 },
      EXECUTION,
    )) as { total: number; tasks: { title: string }[] };
    const titles = output.tasks.map((task) => task.title);
    expect(titles).toEqual(expect.arrayContaining([taskTitles.onJobA, taskTitles.scopedOwn]));
    expect(titles).not.toContain(taskTitles.onJobB);
    expect(titles).not.toContain(taskTitles.unlinkedOther);
    expect(output.total).toBe(titles.length);
  });

  it("counts only the caller's visible tasks in task counts and the hiring brief", async () => {
    actAs("scoped");
    const counts = (await tools("scoped").taskCounts.execute!({}, EXECUTION)) as Record<string, number>;
    expect(counts.pending).toBe(2);
    const brief = (await tools("scoped").hiringBrief.execute!({}, EXECUTION)) as {
      taskCounts: Record<string, number>;
    };
    expect(brief.taskCounts.pending).toBe(2);
  });

  it("returns an explicit not-permitted result for hiring performance to a restricted caller", async () => {
    actAs("scoped");
    const output = (await tools("scoped").hiringReport.execute!({}, EXECUTION)) as {
      permitted?: boolean;
      metrics?: unknown;
    };
    expect(output.permitted).toBe(false);
    expect(output.metrics).toBeUndefined();
  });

  it("returns an explicit not-permitted result for the reports overview to a restricted caller", async () => {
    actAs("scoped");
    const output = (await tools("scoped").reportsOverview.execute!({}, EXECUTION)) as {
      permitted?: boolean;
      summary?: unknown;
    };
    expect(output.permitted).toBe(false);
    expect(output.summary).toBeUndefined();
  });

  it("returns the score only for an application inside the caller's scope", async () => {
    actAs("scoped");
    const visible = (await tools("scoped").getCandidateScore.execute!(
      { applicationId: scoredAppOnA },
      EXECUTION,
    )) as { scored: boolean; score?: number };
    expect(visible).toMatchObject({ scored: true, score: 71 });
    const hidden = (await tools("scoped").getCandidateScore.execute!(
      { applicationId: fx.applicationAB.onB },
      EXECUTION,
    )) as { scored: boolean; score?: number };
    expect(hidden).toEqual({ scored: false });
  });

  it("compares only in-scope applications for a scoped caller", async () => {
    actAs("scoped");
    const output = (await tools("scoped").compareCandidates.execute!(
      { applicationIds: [fx.applicationAB.onA, fx.applicationAB.onB] },
      EXECUTION,
    )) as { compared: { applicationId: string }[]; missingScores: string[] };
    expect(output.compared.map((row) => row.applicationId)).toEqual([fx.applicationAB.onA]);
    expect(output.missingScores).not.toContain(fx.applicationAB.onB);
  });

  it("lists only offers on in-scope applications for a scoped caller", async () => {
    actAs("scoped");
    const output = (await tools("scoped").listCandidateOffers.execute!(
      { candidateId: fx.candidateAB },
      EXECUTION,
    )) as { count: number; offers: { applicationId: string }[] };
    expect(output.offers.map((offer) => offer.applicationId)).toEqual([fx.applicationAB.onA]);
    expect(output.count).toBe(1);
  });

  it("keeps every task, score, comparison and offer for an unrestricted caller", async () => {
    actAs("full");
    const listed = (await tools("full").listTasks.execute!(
      { status: null, offset: 0, limit: 50 },
      EXECUTION,
    )) as { tasks: { title: string }[] };
    expect(listed.tasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([taskTitles.onJobA, taskTitles.onJobB, taskTitles.scopedOwn, taskTitles.unlinkedOther]),
    );
    const counts = (await tools("full").taskCounts.execute!({}, EXECUTION)) as Record<string, number>;
    expect(counts.pending).toBeGreaterThanOrEqual(4);

    const hiring = (await tools("full").hiringReport.execute!({}, EXECUTION)) as { permitted?: boolean; metrics?: unknown };
    expect(hiring.permitted).toBeUndefined();
    expect(hiring.metrics).toBeDefined();
    const overview = (await tools("full").reportsOverview.execute!({}, EXECUTION)) as { permitted?: boolean; summary?: unknown };
    expect(overview.permitted).toBeUndefined();
    expect(overview.summary).toBeDefined();

    const score = (await tools("full").getCandidateScore.execute!(
      { applicationId: fx.applicationAB.onB },
      EXECUTION,
    )) as { scored: boolean };
    expect(score.scored).toBe(true);

    const compared = (await tools("full").compareCandidates.execute!(
      { applicationIds: [fx.applicationAB.onA, fx.applicationAB.onB] },
      EXECUTION,
    )) as { compared: { applicationId: string }[] };
    expect(compared.compared).toHaveLength(2);

    const offersOut = (await tools("full").listCandidateOffers.execute!(
      { candidateId: fx.candidateAB },
      EXECUTION,
    )) as { count: number };
    expect(offersOut.count).toBe(2);
  });
});
