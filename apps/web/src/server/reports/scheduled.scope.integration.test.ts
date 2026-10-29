import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { db, member, scheduledReportRuns, scheduledReports } from "@harly/db";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const mocks = vi.hoisted(() => ({
  enqueueEmailOutbox: vi.fn<
    (workspaceId: string, kind: string, payload: { subject: string }, key: string) => Promise<void>
  >(async () => undefined),
}));

vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
}));

import { listScheduledReports, runDueScheduledReports } from "./scheduled";

describe.skipIf(!runPipelineIntegration)("scheduled reports: creator scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedSchedule: string;
  let fullSchedule: string;
  let plainSchedule: string;
  let removedSchedule: string;
  let ownerlessSchedule: string;
  let sweep: { processed: number; failed: number; skipped: number };

  function memberOf(actor: ActorKey, role: string) {
    return {
      id: `member-${actor}-${fx.workspaceId}`,
      organizationId: fx.workspaceId,
      userId: fx.users[actor],
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async function schedule(name: string, createdById: string | null) {
    const [row] = await db
      .insert(scheduledReports)
      .values({
        workspaceId: fx.workspaceId,
        name,
        recipients: ["ops@example.test"],
        frequency: "weekly",
        reportType: "hiring_overview",
        createdById,
        nextRunAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: scheduledReports.id });
    return row.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    await db.insert(member).values([
      memberOf("scoped", fx.roleKeys.scoped),
      memberOf("full", fx.roleKeys.full),
      memberOf("plain", fx.roleKeys.plain),
    ]);
    scopedSchedule = await schedule("Scoped owner", fx.users.scoped);
    fullSchedule = await schedule("Full owner", fx.users.full);
    plainSchedule = await schedule("Plain owner", fx.users.plain);
    removedSchedule = await schedule("Removed owner", fx.users.none);
    ownerlessSchedule = await schedule("Ownerless", null);

    sweep = await runDueScheduledReports(100, { workspaceId: fx.workspaceId });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("does not send a schedule owned by a user limited to specific jobs", () => {
    const subjects = mocks.enqueueEmailOutbox.mock.calls.map(([, , payload]) => payload.subject);
    expect(subjects.some((subject) => subject.startsWith("Scoped owner"))).toBe(false);
    expect(subjects.some((subject) => subject.startsWith("Full owner"))).toBe(true);
  });

  it("records the skip with a clear reason and advances the schedule", async () => {
    const [run] = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, scopedSchedule));
    expect(run.status).toBe("skipped");
    expect(run.error).toMatch(/limited to specific jobs/);
    const [row] = await db.select().from(scheduledReports).where(eq(scheduledReports.id, scopedSchedule));
    expect(row.lockedAt).toBeNull();
    expect(row.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("sends a schedule owned by an unrestricted user", async () => {
    const [run] = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, fullSchedule));
    expect(run.status).toBe("queued");
    expect(run.error).toBeNull();
  });

  it("skips a schedule whose creator no longer has report access", async () => {
    const [run] = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, plainSchedule));
    expect(run.status).toBe("skipped");
    expect(run.error).toMatch(/no longer has report access/);
  });

  it("skips a schedule whose creator is no longer a member of the workspace", async () => {
    const [run] = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, removedSchedule));
    expect(run.status).toBe("skipped");
    expect(run.error).toMatch(/no longer a member/);
  });

  it("skips a schedule with no creator on record", async () => {
    const [run] = await db
      .select()
      .from(scheduledReportRuns)
      .where(eq(scheduledReportRuns.scheduledReportId, ownerlessSchedule));
    expect(run.status).toBe("skipped");
    expect(run.error).toMatch(/no creator/);
  });

  it("counts skips separately from failures", () => {
    expect(sweep).toEqual({ processed: 1, failed: 0, skipped: 4 });
  });

  it("surfaces the latest run status and reason on the schedule list", async () => {
    const rows = await listScheduledReports(fx.workspaceId);
    const scoped = rows.find((row) => row.id === scopedSchedule);
    expect(scoped?.lastRun).toMatchObject({ status: "skipped" });
    expect(scoped?.lastRun?.error).toMatch(/limited to specific jobs/);
    const full = rows.find((row) => row.id === fullSchedule);
    expect(full?.lastRun).toMatchObject({ status: "queued" });
  });
});
