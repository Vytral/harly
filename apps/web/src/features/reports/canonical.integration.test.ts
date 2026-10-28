import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  activityEvents,
  applicationStageHistory,
  applications,
  candidateDemographics,
  candidates,
  db,
  jobs,
  jobStages,
  offers,
  workspaceSettings,
  type JobStage,
  type StageKind,
} from "@harly/db";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const context = vi.hoisted(() => ({ workspaceId: "" }));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({ organization: { id: context.workspaceId } })),
  can: vi.fn(async () => true),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: context.workspaceId },
    user: { id: "viewer" },
  })),
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(async () => undefined),
}));

import {
  getApplicationsReceived,
  getHireStats,
  getHiresByJob,
  getHiringKpis,
  getJobFunnel,
  getMonthlyCounts,
  getOfferAcceptance,
  getSourceEffectiveness,
  getWorkspaceFunnel,
} from "./canonical";
import { getAdvancedHiringAnalytics } from "./advanced";
import { loadReportsData, getReportsData } from "./data";
import { buildScheduledReport } from "@/server/reports/scheduled";
import { getHiringPerformance } from "@/features/dashboard/widgets";
import { trailingMonths, type ReportWindow } from "./window";
import { bucketTimeToHire } from "./metrics";

/** Fixed window for every test: all of January 2026, UTC. */
const WINDOW: ReportWindow = {
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-02-01T00:00:00.000Z"),
  timeZone: "UTC",
  days: null,
};
const day = (d: number, hour = 12) => new Date(Date.UTC(2026, 0, d, hour));

describe.skipIf(!runPipelineIntegration)("canonical hiring metrics (database)", () => {
  let fx: PipelineFixture;
  let stages: Partial<Record<StageKind, JobStage>>;
  let closedJobId: string;
  let closedStages: Partial<Record<StageKind, JobStage>>;

  beforeEach(async () => {
    fx = await createPipelineFixture();
    context.workspaceId = fx.workspaceId;
    stages = fx.stages;
    const closed = await fx.addJob();
    closedJobId = closed.jobId;
    closedStages = closed.stages;
    await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, closedJobId));
  });

  afterEach(async () => {
    await fx?.cleanup();
    vi.useRealTimers();
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  async function candidate(deletedAt: Date | null = null) {
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Test",
        lastName: "Candidate",
        email: `candidate-${randomUUID()}@example.test`,
        deletedAt,
      })
      .returning({ id: candidates.id });
    return row.id;
  }

  async function application(input: {
    candidateId?: string;
    jobId?: string;
    stageId: string;
    status?: "active" | "hired" | "rejected" | "withdrawn";
    appliedAt: Date;
    updatedAt?: Date;
    source?: string | null;
  }) {
    const candidateId = input.candidateId ?? (await candidate());
    const [row] = await db
      .insert(applications)
      .values({
        workspaceId: fx.workspaceId,
        candidateId,
        jobId: input.jobId ?? fx.jobId,
        currentStageId: input.stageId,
        status: input.status ?? "active",
        appliedAt: input.appliedAt,
        updatedAt: input.updatedAt ?? input.appliedAt,
        source: input.source ?? null,
      })
      .returning({ id: applications.id });
    return { applicationId: row.id, candidateId };
  }

  async function move(applicationId: string, toStageId: string, at: Date) {
    await db.insert(applicationStageHistory).values({
      workspaceId: fx.workspaceId,
      applicationId,
      toStageId,
      fromStageId: null,
      movedById: fx.userId,
      createdAt: at,
    });
  }

  async function hire(input: { appliedAt: Date; hiredAt: Date; jobId?: string; source?: string | null; stageId?: string }) {
    const hiredStage = input.stageId ?? stages.hired!.id;
    const app = await application({
      appliedAt: input.appliedAt,
      stageId: hiredStage,
      status: "hired",
      jobId: input.jobId,
      source: input.source,
    });
    await move(app.applicationId, hiredStage, input.hiredAt);
    return app;
  }

  async function offer(input: {
    applicationId: string;
    candidateId: string;
    status: "accepted" | "declined" | "sent";
    decidedAt: Date | null;
    jobId?: string;
  }) {
    await db.insert(offers).values({
      workspaceId: fx.workspaceId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId ?? fx.jobId,
      status: input.status,
      title: "Engineer",
      createdById: fx.userId,
      decidedAt: input.decidedAt,
    });
  }

  // ── hires ──────────────────────────────────────────────────────────────────

  it("counts a hire once, dated by the latest transition into a hired-kind stage", async () => {
    const app = await application({ stageId: stages.applied!.id, appliedAt: day(5), status: "hired" });
    await move(app.applicationId, stages.hired!.id, day(15));
    await move(app.applicationId, stages.hired!.id, day(20));

    const stats = await getHireStats({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(stats.hires).toBe(1);
    expect(stats.averageDays).toBe(15);
  });

  it("still recognises the Hired stage after it is renamed, because the kind is what counts", async () => {
    await db.update(jobStages).set({ name: "Closed won" }).where(eq(jobStages.id, stages.hired!.id));
    await hire({ appliedAt: day(2), hiredAt: day(10) });

    expect((await getHireStats({ workspaceId: fx.workspaceId, window: WINDOW })).hires).toBe(1);
  });

  it("falls back to activity events, then updated_at, for legacy hires with no stage history", async () => {
    const withActivity = await application({
      stageId: stages.applied!.id,
      appliedAt: day(2),
      status: "hired",
    });
    await db.insert(activityEvents).values([
      {
        workspaceId: fx.workspaceId,
        entityType: "application",
        entityId: withActivity.applicationId,
        type: "application.hired",
        createdAt: day(12),
      },
      {
        workspaceId: fx.workspaceId,
        entityType: "application",
        entityId: withActivity.applicationId,
        type: "application.hired",
        createdAt: day(20),
      },
    ]);
    // No history and no activity: the row's updated_at is the last resort.
    await application({
      stageId: stages.applied!.id,
      appliedAt: day(3),
      status: "hired",
      updatedAt: day(13),
    });

    const stats = await getHireStats({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(stats.hires).toBe(2);
    // Earliest activity (Jan 12) minus Jan 2 is 10 days; updated_at (Jan 13) minus Jan 3 is 10 days.
    expect(stats.averageDays).toBe(10);
  });

  it("does not count a candidate who was moved back out of Hired", async () => {
    const app = await application({ stageId: stages.screening!.id, appliedAt: day(3) });
    await move(app.applicationId, stages.hired!.id, day(10));
    await move(app.applicationId, stages.screening!.id, day(11));

    expect((await getHireStats({ workspaceId: fx.workspaceId, window: WINDOW })).hires).toBe(0);
  });

  it("does not count a hired-then-rejected application as a hire", async () => {
    const app = await application({
      stageId: stages.rejected!.id,
      appliedAt: day(3),
      status: "rejected",
    });
    await move(app.applicationId, stages.hired!.id, day(10));
    await move(app.applicationId, stages.rejected!.id, day(11));

    const kpis = await getHiringKpis({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(kpis.hires).toBe(0);
    expect(kpis.applications).toBe(1);
  });

  it("excludes soft-deleted candidates and soft-deleted jobs, but keeps closed jobs", async () => {
    const deletedCandidate = await candidate(day(20));
    await hire({ appliedAt: day(2), hiredAt: day(10) });
    await application({ candidateId: deletedCandidate, stageId: stages.applied!.id, appliedAt: day(4) });
    const archivedJob = await fx.addJob();
    await db.update(jobs).set({ deletedAt: day(20) }).where(eq(jobs.id, archivedJob.jobId));
    await hire({ appliedAt: day(2), hiredAt: day(11), jobId: archivedJob.jobId, stageId: archivedJob.stages.hired!.id });
    await hire({ appliedAt: day(2), hiredAt: day(12), jobId: closedJobId, stageId: closedStages.hired!.id });

    const kpis = await getHiringKpis({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(kpis.hires).toBe(2);
    // The fixture hire and the closed-job hire count; the deleted candidate and the deleted job do not.
    expect(kpis.applications).toBe(2);
    const byJob = await getHiresByJob({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(byJob.get(closedJobId)).toBe(1);
    expect(byJob.get(archivedJob.jobId)).toBeUndefined();
  });

  it("computes time to hire and buckets with the same rule as the JS metrics", async () => {
    const days = [10, 14.5, 20.5, 45, 80, 120];
    const events: { applicationId: string; appliedAt: Date; hiredAt: Date }[] = [];
    for (const [i, span] of days.entries()) {
      const appliedAt = new Date(Date.UTC(2025, 6, 1 + i));
      const hiredAt = new Date(appliedAt.getTime() + span * 86_400_000);
      const { applicationId } = await hire({ appliedAt, hiredAt });
      events.push({ applicationId, appliedAt, hiredAt });
    }
    const wide: ReportWindow = { ...WINDOW, from: new Date("2025-01-01T00:00:00.000Z"), to: new Date("2027-01-01T00:00:00.000Z") };

    const stats = await getHireStats({ workspaceId: fx.workspaceId, window: wide });
    expect(stats.buckets.map((b) => b.count)).toEqual(
      bucketTimeToHire(events).map((b) => b.count),
    );
    expect(stats.buckets.map((b) => b.count)).toEqual([2, 1, 1, 1, 1]);
    // Median of 10, 14.5, 20.5, 45, 80, 120 is (20.5 + 45) / 2.
    expect(stats.medianDays).toBe(32.8);
    expect(stats.averageDays).toBe(Math.round(((10 + 14.5 + 20.5 + 45 + 80 + 120) / 6) * 10) / 10);
  });

  it("uses half-open window boundaries for applications and hire dates", async () => {
    await application({ stageId: stages.applied!.id, appliedAt: WINDOW.from });
    await application({ stageId: stages.applied!.id, appliedAt: WINDOW.to });
    await application({ stageId: stages.applied!.id, appliedAt: new Date(WINDOW.from.getTime() - 1) });
    // Applied before the window, so these hires do not add to applications received.
    const appliedBefore = new Date("2025-12-20T00:00:00.000Z");
    await hire({ appliedAt: appliedBefore, hiredAt: WINDOW.from });
    await hire({ appliedAt: appliedBefore, hiredAt: WINDOW.to });

    expect(await getApplicationsReceived({ workspaceId: fx.workspaceId, window: WINDOW })).toBe(1);
    expect((await getHireStats({ workspaceId: fx.workspaceId, window: WINDOW })).hires).toBe(1);
  });

  // ── offers ─────────────────────────────────────────────────────────────────

  it("measures acceptance by decision date, ignores undecided and deleted-candidate offers, and is null with none", async () => {
    const a = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: a.applicationId, candidateId: a.candidateId, status: "accepted", decidedAt: day(10) });
    const b = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: b.applicationId, candidateId: b.candidateId, status: "declined", decidedAt: day(11) });
    const c = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: c.applicationId, candidateId: c.candidateId, status: "accepted", decidedAt: new Date("2026-02-05T00:00:00.000Z") });
    const d = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: d.applicationId, candidateId: d.candidateId, status: "sent", decidedAt: null });
    const deleted = await candidate(day(15));
    const e = await application({ candidateId: deleted, stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: e.applicationId, candidateId: deleted, status: "accepted", decidedAt: day(12) });

    const acceptance = await getOfferAcceptance({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(acceptance).toEqual({ accepted: 1, declined: 1, rate: 50 });

    const empty: ReportWindow = { ...WINDOW, from: new Date("2026-03-01T00:00:00.000Z"), to: new Date("2026-04-01T00:00:00.000Z") };
    expect(await getOfferAcceptance({ workspaceId: fx.workspaceId, window: empty })).toEqual({
      accepted: 0,
      declined: 0,
      rate: null,
    });
  });

  it("reports and dashboard read one acceptance number", async () => {
    const now = new Date("2026-01-31T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);

    const a = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: a.applicationId, candidateId: a.candidateId, status: "accepted", decidedAt: day(20) });
    const b = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: b.applicationId, candidateId: b.candidateId, status: "declined", decidedAt: day(21) });
    const c = await application({ stageId: stages.offer!.id, appliedAt: day(1) });
    await offer({ applicationId: c.applicationId, candidateId: c.candidateId, status: "accepted", decidedAt: day(22) });

    const reports = await loadReportsData({ workspaceId: fx.workspaceId, days: 30, now });
    const dashboard = await getHiringPerformance();

    expect(reports.summary.offerAcceptRate).toBe(67);
    expect(dashboard.metrics.offerAcceptance.value).toBe(reports.summary.offerAcceptRate);
    expect(reports.summary.offers).toEqual({ accepted: 2, declined: 1 });
  });

  // ── funnel and jobs ────────────────────────────────────────────────────────

  it("counts applications that ever reached each kind, against applications received", async () => {
    const a1 = await application({ stageId: stages.interview!.id, appliedAt: day(5) });
    await move(a1.applicationId, stages.screening!.id, day(6));
    await move(a1.applicationId, stages.interview!.id, day(7));

    const a2 = await application({ stageId: stages.screening!.id, appliedAt: day(6) });
    await move(a2.applicationId, stages.screening!.id, day(6, 13));

    const a3 = await application({ stageId: stages.hired!.id, appliedAt: day(7), status: "hired" });
    await move(a3.applicationId, stages.screening!.id, day(8));
    await move(a3.applicationId, stages.interview!.id, day(9));
    await move(a3.applicationId, stages.offer!.id, day(10));
    await move(a3.applicationId, stages.hired!.id, day(11));

    await application({ stageId: stages.applied!.id, appliedAt: day(8) });
    await application({ stageId: stages.applied!.id, appliedAt: new Date("2026-02-05T00:00:00.000Z") });

    const funnel = await getWorkspaceFunnel({ workspaceId: fx.workspaceId, window: WINDOW });
    expect(funnel.applicationsReceived).toBe(4);
    const reached = Object.fromEntries(funnel.stages.map((s) => [s.kind, s.reached]));
    expect(reached).toEqual({ applied: 4, screening: 3, interview: 2, offer: 1, hired: 1 });
    expect(funnel.stages.find((s) => s.kind === "screening")?.pct).toBe(75);
    expect(funnel.stages.find((s) => s.kind === "hired")?.activeNow).toBe(0);
    expect(funnel.stages.find((s) => s.kind === "interview")?.activeNow).toBe(1);
  });

  it("lists a job's active stages in order with reach counts", async () => {
    const a1 = await application({ stageId: stages.interview!.id, appliedAt: day(5) });
    await move(a1.applicationId, stages.screening!.id, day(6));
    await move(a1.applicationId, stages.interview!.id, day(7));
    await application({ stageId: stages.applied!.id, appliedAt: day(9) });

    const funnel = await getJobFunnel({ workspaceId: fx.workspaceId, jobId: fx.jobId, window: WINDOW });
    expect(funnel.applicationsReceived).toBe(2);
    const byName = Object.fromEntries(funnel.stages.map((s) => [s.name, s.reached]));
    // The second application sits in Applied now, so it has reached Applied.
    expect(byName).toMatchObject({ Applied: 1, Screening: 1, Interview: 1, Hired: 0 });
    expect(funnel.stages.map((s) => s.name)).toEqual(["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]);
  });

  it("breaks sources into applications and hires, with a null conversion when there are no applications", async () => {
    await application({ stageId: stages.applied!.id, appliedAt: day(3), source: "referral" });
    await hire({ appliedAt: day(3), hiredAt: day(9), source: "referral" });
    await application({ stageId: stages.applied!.id, appliedAt: day(4), source: null });

    const rows = await getSourceEffectiveness({ workspaceId: fx.workspaceId, window: WINDOW });
    const referral = rows.find((r) => r.source === "referral");
    expect(referral).toEqual({ source: "referral", applications: 2, hires: 1, conversion: 50 });
    expect(rows.find((r) => r.source === "unknown")?.conversion).toBe(0);
  });

  // ── diversity ──────────────────────────────────────────────────────────────

  it("suppresses diversity cells with fewer than five applicants", async () => {
    for (let i = 0; i < 5; i++) {
      const { candidateId } = await application({ stageId: stages.applied!.id, appliedAt: day(3 + i) });
      await db.insert(candidateDemographics).values({
        workspaceId: fx.workspaceId,
        candidateId,
        gender: "female",
        consentAt: day(1),
      });
    }
    for (let i = 0; i < 2; i++) {
      const { candidateId } = await application({ stageId: stages.applied!.id, appliedAt: day(3 + i) });
      await db.insert(candidateDemographics).values({
        workspaceId: fx.workspaceId,
        candidateId,
        gender: "male",
        consentAt: day(1),
      });
    }

    const analytics = await getAdvancedHiringAnalytics({ workspaceId: fx.workspaceId, window: WINDOW });
    const female = analytics.diversity.find((row) => row.dimension === "gender" && row.value === "female");
    const male = analytics.diversity.find((row) => row.dimension === "gender" && row.value === "male");
    expect(female).toMatchObject({ suppressed: false, applicants: 5, hires: 0 });
    expect(male).toEqual({ dimension: "gender", value: "male", suppressed: true });
    expect(male).not.toHaveProperty("applicants");
  });

  // ── time zone ──────────────────────────────────────────────────────────────

  it("buckets months in the workspace time zone, not UTC", async () => {
    await db.insert(workspaceSettings).values({
      organizationId: fx.workspaceId,
      timezone: "America/Los_Angeles",
    });
    // 2026-02-01 07:30Z is still January 31 in Los Angeles.
    await application({ stageId: stages.applied!.id, appliedAt: new Date("2026-02-01T07:30:00.000Z") });

    const now = new Date("2026-02-15T12:00:00.000Z");
    const { keys, window } = trailingMonths(3, "America/Los_Angeles", now);
    const counts = await getMonthlyCounts({ workspaceId: fx.workspaceId, window }, "applications");
    expect(keys).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(counts.get("2026-01")).toBe(1);
    expect(counts.get("2026-02")).toBeUndefined();
  });

  // ── parity across surfaces ─────────────────────────────────────────────────

  it("gives the scheduled email the same totals as the Reports page", async () => {
    const now = new Date("2026-01-31T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);

    await hire({ appliedAt: day(3), hiredAt: day(20), source: "linkedin" });
    await application({ stageId: stages.applied!.id, appliedAt: day(25), source: "linkedin" });
    await application({ stageId: stages.applied!.id, appliedAt: day(26) });

    const page = await getReportsData(30);
    const scheduled = await buildScheduledReport({
      workspaceId: fx.workspaceId,
      name: "Weekly",
      reportType: "hiring_overview",
      now,
    });

    expect(scheduled.data.summary).toEqual(page.summary);
    expect(scheduled.data.funnel).toEqual(page.funnel);
    expect(scheduled.data.sources).toEqual(page.sources);
    expect(scheduled.html).toContain(`Applications received: <strong>${page.summary.applications}</strong>`);
    expect(scheduled.html).toContain(`Hires: <strong>${page.summary.hires}</strong>`);
    expect(page.summary.applications).toBe(3);
    expect(page.summary.hires).toBe(1);
  });

  it("keeps the dashboard's hires consistent with the canonical KPIs for the same window", async () => {
    const now = new Date("2026-01-31T12:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await hire({ appliedAt: day(20), hiredAt: day(25) });

    const dashboard = await getHiringPerformance();
    const series = dashboard.series.hires.reduce((total, point) => total + point.value, 0);
    expect(dashboard.metrics.hires.value).toBe(1);
    expect(series).toBe(1);
  });
});
