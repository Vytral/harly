import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import {
  archiveStage,
  createStage,
  listJobStages,
  updateStage,
} from "./stage-lifecycle";

/**
 * Jobs created before 0.3.0 can hold "Interview" and "interview " side by side
 * (the old name index was case-sensitive). Those duplicates must not freeze
 * unrelated edits; only an operation that introduces a duplicate is refused.
 */
describe.skipIf(!runPipelineIntegration)("stage lifecycle with legacy duplicate names", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  async function jobWithLegacyDuplicate() {
    const job = await fx.addJob();
    const [legacy] = await db
      .insert(jobStages)
      .values({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        name: "interview ",
        kind: "custom",
        order: 20,
      })
      .returning();
    return { jobId: job.jobId, stages: job.stages, legacyId: legacy!.id };
  }

  const scope = (jobId: string) => ({
    workspaceId: fx.workspaceId,
    jobId,
    actorUserId: fx.userId,
  });

  it("a colour change on an unrelated stage succeeds while a legacy duplicate exists", async () => {
    const { jobId, stages } = await jobWithLegacyDuplicate();
    const updated = await updateStage({
      ...scope(jobId),
      stageId: stages.applied!.id,
      patch: { color: "#123456" },
    });
    expect(updated.color).toBe("#123456");
  });

  it("archiving one of the duplicates succeeds and resolves the duplicate", async () => {
    const { jobId, legacyId } = await jobWithLegacyDuplicate();
    await archiveStage({ ...scope(jobId), stageId: legacyId });
    const names = (await listJobStages({ workspaceId: fx.workspaceId, jobId })).map((s) => s.name);
    expect(names.filter((name) => name.trim().toLowerCase() === "interview")).toHaveLength(1);
  });

  it("renaming one of the duplicates succeeds and resolves the duplicate", async () => {
    const { jobId, legacyId } = await jobWithLegacyDuplicate();
    const renamed = await updateStage({
      ...scope(jobId),
      stageId: legacyId,
      patch: { name: "Interview (legacy)" },
    });
    expect(renamed.name).toBe("Interview (legacy)");
  });

  it("creating a stage whose name collides with an existing one is still refused", async () => {
    const { jobId } = await jobWithLegacyDuplicate();
    await expect(
      createStage({ ...scope(jobId), name: "INTERVIEW" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("a rename that would introduce a duplicate is still refused", async () => {
    const { jobId, stages } = await fx.addJob().then(async (job) => ({ jobId: job.jobId, stages: job.stages }));
    await expect(
      updateStage({ ...scope(jobId), stageId: stages.screening!.id, patch: { name: "applied" } }),
    ).rejects.toMatchObject({ code: "conflict" });
    const [row] = await db.select().from(jobStages).where(eq(jobStages.id, stages.screening!.id));
    expect(row!.name).toBe("Screening");
  });
});
