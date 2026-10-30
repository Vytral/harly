import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { archiveStage } from "./stage-lifecycle";

describe.skipIf(!runPipelineIntegration)("archiving a stage against a concurrent placement", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("retries an archive that Postgres aborts as a deadlock victim, then archives the stage", async () => {
    const job = await fx.addJob();
    const source = job.stages.screening!;
    const target = job.stages.interview!;

    // The placement locks the target stage, then the job. Meanwhile the archive
    // holds the job and waits for the target stage: a lock cycle that Postgres
    // resolves by aborting one side with SQLSTATE 40P01.
    let placed!: () => void;
    const placementHoldsTarget = new Promise<void>((resolve) => {
      placed = resolve;
    });
    const placing = db
      .transaction(async (tx) => {
        await tx.execute(
          sql`select id from job_stages where id = ${target.id}::uuid for update`,
        );
        placed();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await tx.execute(
          sql`select id from jobs where id = ${job.jobId}::uuid for update`,
        );
      })
      .then(
        () => "committed" as const,
        () => "aborted" as const,
      );
    await placementHoldsTarget;

    const result = await archiveStage({
      workspaceId: fx.workspaceId,
      jobId: job.jobId,
      actorUserId: fx.userId,
      stageId: source.id,
      mergeIntoStageId: target.id,
    });
    await placing;

    expect(result.stage.archivedAt).not.toBeNull();
    const [row] = await db
      .select({ archivedAt: jobStages.archivedAt })
      .from(jobStages)
      .where(eq(jobStages.id, source.id));
    expect(row!.archivedAt).not.toBeNull();
  }, 30_000);
});
