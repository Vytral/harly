import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applicationStageHistory, db } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { createStage, updateStage } from "./stage-lifecycle";

describe.skipIf(!runPipelineIntegration)("stage kind changes and recorded history", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  function actor() {
    return { workspaceId: fx.workspaceId, jobId: fx.jobId, actorUserId: fx.userId };
  }

  it("refuses to reclassify an emptied hired stage that history still refers to", async () => {
    const second = await createStage({ ...actor(), name: "Joined", kind: "hired" });
    const { applicationId } = await fx.addApplication({ stageId: second.id, status: "hired" });
    // The application was hired into "Hired" first and later moved to "Joined".
    await db.insert(applicationStageHistory).values([
      { workspaceId: fx.workspaceId, applicationId, toStageId: fx.stages.hired!.id },
      {
        workspaceId: fx.workspaceId,
        applicationId,
        fromStageId: fx.stages.hired!.id,
        toStageId: second.id,
      },
    ]);

    await expect(
      updateStage({ ...actor(), stageId: fx.stages.hired!.id, patch: { kind: "custom" } }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("still allows reclassifying a terminal stage nothing has ever touched", async () => {
    const unused = await createStage({ ...actor(), name: "Unused outcome", kind: "hired" });
    const updated = await updateStage({ ...actor(), stageId: unused.id, patch: { kind: "custom" } });
    expect(updated.kind).toBe("custom");
  });

  it("still allows renaming a stage that history refers to", async () => {
    const renamed = await updateStage({
      ...actor(),
      stageId: fx.stages.hired!.id,
      patch: { name: "Joined the team" },
    });
    expect(renamed.name).toBe("Joined the team");
  });
});
