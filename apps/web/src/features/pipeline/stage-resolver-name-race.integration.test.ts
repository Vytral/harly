import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db, jobStages, jobs } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { ensureStageOfKind } from "./stage-resolver";

describe.skipIf(!runPipelineIntegration)("ensureStageOfKind against a concurrent stage create", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("does not add a second active stage whose name differs only by case", async () => {
    const job = await fx.addJob();
    // Pretend the job has no withdrawn stage. Creating a stage named "withdrawn"
    // (createStage) holds the job row lock until it commits; ensureStageOfKind must
    // wait for that commit and then see the new name, not create "Withdrawn" beside it.
    let inserted!: () => void;
    const insertedDone = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    let release!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const creating = db.transaction(async (tx) => {
      await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.id, job.jobId), isNull(jobs.deletedAt)))
        .for("update");
      await tx.insert(jobStages).values({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        name: "withdrawn",
        kind: "custom",
        order: 30,
      });
      inserted();
      await releaseGate;
    });
    await insertedDone;

    const ensuring = db.transaction((tx) =>
      ensureStageOfKind(tx, { workspaceId: fx.workspaceId, jobId: job.jobId, kind: "withdrawn" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    release!();
    await creating;
    const created = await ensuring;

    expect(created.kind).toBe("withdrawn");
    const active = await db
      .select({ name: jobStages.name })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.jobId, job.jobId),
          isNull(jobStages.archivedAt),
          sql`lower(${jobStages.name}) like 'withdrawn%'`,
        ),
      );
    expect(active.map((row) => row.name).sort()).toEqual(["Withdrawn (2)", "withdrawn"].sort());
    expect(created.name).toBe("Withdrawn (2)");
  });
});
