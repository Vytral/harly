import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { applications, candidates, db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { archiveStage } from "./stage-lifecycle";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Resolves to "pending" if the promise has not settled within `ms`. */
async function settledWithin<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    sleep(ms).then(() => "pending" as const),
  ]);
}

async function insertCandidate(executor: Pick<Tx, "insert">, workspaceId: string) {
  const [row] = await executor
    .insert(candidates)
    .values({
      workspaceId,
      firstName: "Race",
      lastName: crypto.randomUUID().slice(0, 6),
      email: `race-${crypto.randomUUID()}@example.test`,
    })
    .returning({ id: candidates.id });
  return row.id;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let e = error as { message?: string; cause?: unknown } | undefined; e; ) {
    parts.push(String(e.message ?? ""));
    e = e.cause as typeof e;
  }
  return parts.join(" | ");
}

describe.skipIf(!runPipelineIntegration)("placing applications vs archiving a stage", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  // An INSERT is already serialized by the job-row lock (the job foreign key
  // takes a key-share lock on the job row). A MOVE of an existing application
  // only touches the stage row, so it is the case the stage-row lock protects.
  it.each(["insert", "move"] as const)(
    "an in-flight %s into the stage is waited for and moved by the archive, never stranded",
    async (placement) => {
      const jobFx = await fx.addJob();
      const source = jobFx.stages.interview!;
      const target = jobFx.stages.screening!;
      const spare = jobFx.stages.applied!;
      const existing =
        placement === "move"
          ? await fx.addApplication({ stageId: spare.id, jobId: jobFx.jobId })
          : null;
      const inserted = deferred();
      const release = deferred();
      let applicationId = existing?.applicationId ?? "";

      const placer = db.transaction(async (tx) => {
        if (existing) {
          await tx
            .update(applications)
            .set({ currentStageId: source.id })
            .where(eq(applications.id, existing.applicationId));
        } else {
          const candidateId = await insertCandidate(tx, fx.workspaceId);
          const [app] = await tx
            .insert(applications)
            .values({
              workspaceId: fx.workspaceId,
              candidateId,
              jobId: jobFx.jobId,
              currentStageId: source.id,
            })
            .returning({ id: applications.id });
          applicationId = app.id;
        }
        inserted.resolve();
        await release.promise; // keep the transaction (and its locks) open
      });

      await inserted.promise;
      const archiving = archiveStage({
        workspaceId: fx.workspaceId,
        jobId: jobFx.jobId,
        actorUserId: fx.userId,
        stageId: source.id,
        mergeIntoStageId: target.id,
      });

      // The archive must wait for the uncommitted placement instead of racing it.
      expect(await settledWithin(archiving, 400)).toBe("pending");

      release.resolve();
      await placer;
      await archiving;

      const [app] = await db
        .select({ stageId: applications.currentStageId })
        .from(applications)
        .where(eq(applications.id, applicationId));
      expect(app.stageId).toBe(target.id);
      const [stage] = await db.select().from(jobStages).where(eq(jobStages.id, source.id));
      expect(stage.archivedAt).not.toBeNull();
    },
  );

  it("a placement that starts while an archive is uncommitted is refused after it commits", async () => {
    const stage = fx.stages.offer!;
    const archived = deferred();
    const commit = deferred();

    const archiver = db.transaction(async (tx) => {
      await tx
        .update(jobStages)
        .set({ archivedAt: new Date() })
        .where(eq(jobStages.id, stage.id));
      archived.resolve();
      await commit.promise;
    });
    await archived.promise;

    const candidateId = await insertCandidate(db, fx.workspaceId);
    const placing = db
      .insert(applications)
      .values({
        workspaceId: fx.workspaceId,
        candidateId,
        jobId: fx.jobId,
        currentStageId: stage.id,
      })
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );

    expect(await settledWithin(placing, 400)).toBe("pending");
    commit.resolve();
    await archiver;

    const result = await placing;
    expect(result.ok).toBe(false);
    expect(errorText(!result.ok ? result.error : "")).toMatch(/archived/);
  });

  it("refuses moving an application into an archived stage but allows other updates", async () => {
    const other = await fx.addJob();
    const archivedStage = other.stages.screening!;
    const live = other.stages.applied!;
    await db
      .update(jobStages)
      .set({ archivedAt: new Date() })
      .where(eq(jobStages.id, archivedStage.id));

    const { applicationId } = await fx.addApplication({
      stageId: live.id,
      jobId: other.jobId,
    });

    await expect(
      db
        .update(applications)
        .set({ currentStageId: archivedStage.id })
        .where(eq(applications.id, applicationId)),
    ).rejects.toSatisfy((e: unknown) => /archived/.test(errorText(e)));

    // A legacy application that already sits in an archived stage can still be
    // edited, and moved OUT of it.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx
        .update(applications)
        .set({ currentStageId: archivedStage.id })
        .where(eq(applications.id, applicationId));
    });
    await db
      .update(applications)
      .set({ coverLetter: "still editable" })
      .where(eq(applications.id, applicationId));
    await db
      .update(applications)
      .set({ currentStageId: live.id })
      .where(eq(applications.id, applicationId));

    const [app] = await db
      .select({ stageId: applications.currentStageId, cover: applications.coverLetter })
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(app.stageId).toBe(live.id);
    expect(app.cover).toBe("still editable");
  });
});
