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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const holder = db.transaction(async (tx) => {
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
      await sleep(200);

      const changing = outcome(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: target.id,
          patch: { kind: "hired" },
        }),
      );
      await sleep(300);

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

      // Whichever side won, the application's status must match the stage it is in.
      expect(app.status).toBe(applicationStatusForStage(stage!));
      if (change.ok) {
        // The kind change was allowed only if the move had not landed yet; then
        // the move must have seen the hired kind and recorded a hire.
        expect(stage!.kind).toBe("hired");
        expect(app.status).toBe("hired");
      } else {
        expect(move.ok).toBe(true);
        expect(stage!.kind).toBe("custom");
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
    const holder = db.transaction(async (tx) => {
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
    await sleep(200);

    const changing = outcome(
      updateStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: entry.id,
        patch: { kind: "hired" },
      }),
    );
    await sleep(300);

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
