import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

import {
  applicationStatusForStage,
  applications,
  candidates,
  db,
  jobStages,
} from "@harly/db";

import {
  createApplicationForApi,
  moveApplicationStageForApi,
} from "@/features/applications/service";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { bulkMoveApplications, moveApplicationInPipeline } from "./actions";
import { updateStage } from "./stage-lifecycle";

// The server actions need a signed-in workspace context. The fixture's
// workspace and owner stand in for it; permissions are not under test here.
const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: ctx.workspaceId },
    user: { id: ctx.userId },
  }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: async () => undefined,
  requireApplicationPermission: async () => undefined,
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Waits until `predicate` holds, polling the database. Fails after the timeout
 * instead of hanging, so a broken barrier shows up as a clear error.
 */
async function waitUntil(predicate: () => Promise<boolean>, label: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Backends in this database currently parked on a lock, not counting this one. */
async function lockWaiterCount(): Promise<number> {
  const rows = await db.execute(sql`
    select count(*)::int as n
    from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and pid <> pg_backend_pid()`);
  return Number((rows[0] as { n: number }).n);
}

/** Backends blocked specifically by the given holder session. */
async function waitersBlockedBy(holderPid: number): Promise<number> {
  const rows = await db.execute(sql`
    select count(*)::int as n
    from pg_stat_activity
    where ${holderPid} = any(pg_blocking_pids(pid))`);
  return Number((rows[0] as { n: number }).n);
}

/**
 * Resolves once the kind change has either finished (it did not need to wait)
 * or parked on a lock behind the in-flight placement, which is the race under test.
 */
async function waitUntilSettledOrParked(changing: Promise<unknown>) {
  let settled = false;
  void changing.then(() => {
    settled = true;
  });
  await waitUntil(
    async () => settled || (await lockWaiterCount()) >= 2,
    "the kind change to finish or wait on a lock",
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

type Move = (input: {
  workspaceId: string;
  applicationId: string;
  fromStageId: string;
  toStageId: string;
  userId: string;
}) => Promise<unknown>;

/** Each placement path that writes an application into a stage. */
const placements: Record<string, Move> = {
  "stage move API": ({ workspaceId, applicationId, toStageId, userId }) =>
    moveApplicationStageForApi({ workspaceId, applicationId, toStageId, actorId: userId }),
  "pipeline move action": ({ workspaceId, applicationId, fromStageId, toStageId }) =>
    moveApplicationInPipeline({
      workspaceId,
      applicationId,
      fromStageId,
      toStageId,
      orderedApplicationIds: [applicationId],
    }),
  "bulk move action": ({ workspaceId, applicationId, toStageId }) =>
    bulkMoveApplications({ workspaceId, applicationIds: [applicationId], toStageId }),
};

describe.skipIf(!runPipelineIntegration)("stage kind change vs an in-flight move", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.userId;
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it.each(Object.keys(placements))(
    "%s: a kind change waits for the in-flight move, so the stage and the application status never disagree",
    async (name) => {
      const job = await fx.addJob();
      const [target] = await db
        .insert(jobStages)
        .values({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          name: "Offer review",
          kind: "custom",
          order: 20,
        })
        .returning();
      const { applicationId } = await fx.addApplication({
        stageId: job.stages.applied!.id,
        jobId: job.jobId,
      });

      // Hold the application row so the move stalls after it has read the
      // target stage, exactly where a kind change can slip in.
      const holderLocked = deferred();
      const releaseHolder = deferred();
      let holderPid = 0;
      const holder = db.transaction(async (tx) => {
        const [self] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        holderPid = Number(self!.pid);
        await tx
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.id, applicationId))
          .for("update");
        holderLocked.resolve();
        await releaseHolder.promise;
      });
      await holderLocked.promise;

      const moving = outcome(
        placements[name]!({
          workspaceId: fx.workspaceId,
          applicationId,
          fromStageId: job.stages.applied!.id,
          toStageId: target.id,
          userId: fx.userId,
        }),
      );
      // The move must be parked behind the holder before the kind change starts.
      await waitUntil(async () => (await waitersBlockedBy(holderPid)) >= 1, "the move to wait on the holder");

      const changing = outcome(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: target.id,
          patch: { kind: "hired" },
        }),
      );
      await waitUntilSettledOrParked(changing);

      releaseHolder.resolve();
      await holder;
      const [move, change] = await Promise.all([moving, changing]);

      const [app] = await db
        .select({ status: applications.status, stageId: applications.currentStageId })
        .from(applications)
        .where(eq(applications.id, applicationId));
      const [stage] = await db
        .select({ name: jobStages.name, kind: jobStages.kind })
        .from(jobStages)
        .where(eq(jobStages.id, app.stageId!));

      const [targetStage] = await db
        .select({ kind: jobStages.kind })
        .from(jobStages)
        .where(eq(jobStages.id, target.id));

      // Whichever side won, the application's status must match the stage it is in.
      expect(app.status).toBe(applicationStatusForStage(stage!));
      if (change.ok) {
        // The kind change was allowed only if the move had not landed yet; then
        // the move must still land, see the hired kind and record a hire.
        expect(move.ok).toBe(true);
        expect(targetStage!.kind).toBe("hired");
        expect(stage!.kind).toBe("hired");
        expect(app.status).toBe("hired");
      } else {
        expect(move.ok).toBe(true);
        expect(targetStage!.kind).toBe("custom");
      }
    },
  );

  it("applying to a job waits for an in-flight kind change of its entry stage, never landing active in a hired stage", async () => {
    const job = await fx.addJob();
    const entry = job.stages.applied!;
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Entry",
        lastName: crypto.randomUUID().slice(0, 6),
        email: `entry-${crypto.randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });

    // Hold the advisory lock creation takes on its entry stage, so the creation
    // stalls after it has read the entry stage and before it inserts.
    const holderLocked = deferred();
    const releaseHolder = deferred();
    let holderPid = 0;
    const holder = db.transaction(async (tx) => {
      const [self] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      holderPid = Number(self!.pid);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${fx.workspaceId} || ':' || ${entry.id}))`,
      );
      holderLocked.resolve();
      await releaseHolder.promise;
    });
    await holderLocked.promise;

    const creating = outcome(
      createApplicationForApi({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        candidateId: candidate.id,
      }),
    );
    await waitUntil(async () => (await waitersBlockedBy(holderPid)) >= 1, "the creation to wait on the holder");

    const changing = outcome(
      updateStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: entry.id,
        patch: { kind: "hired" },
      }),
    );
    await waitUntilSettledOrParked(changing);

    releaseHolder.resolve();
    await holder;
    const [created, change] = await Promise.all([creating, changing]);

    const [stage] = await db
      .select({ name: jobStages.name, kind: jobStages.kind })
      .from(jobStages)
      .where(eq(jobStages.id, entry.id));
    const [app] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.candidateId, candidate.id));
    if (app) {
      expect(app.status).toBe(applicationStatusForStage(stage!));
    }
    if (change.ok) {
      expect(stage!.kind).toBe("hired");
      expect(created.ok).toBe(false);
    } else {
      expect(created.ok).toBe(true);
      expect(stage!.kind).toBe("applied");
    }
  });
});
