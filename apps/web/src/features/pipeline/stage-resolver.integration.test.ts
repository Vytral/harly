import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import {
  ensureStageOfKind,
  listActiveJobStages,
  resolveEntryStage,
  resolveStageByKind,
} from "./stage-resolver";

describe.skipIf(!runPipelineIntegration)("stage resolver", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists active stages in order and resolves entry and kind stages", async () => {
    const stages = await listActiveJobStages(db, fx);
    expect(stages.map((s) => s.name)).toEqual([
      "Applied",
      "Screening",
      "Interview",
      "Offer",
      "Hired",
      "Rejected",
    ]);
    expect((await resolveEntryStage(db, fx))?.name).toBe("Applied");
    expect((await resolveStageByKind(db, { ...fx, kind: "offer" }))?.name).toBe(
      "Offer",
    );
    expect(await resolveStageByKind(db, { ...fx, kind: "withdrawn" })).toBeNull();
  });

  it("returns the existing stage instead of creating a duplicate", async () => {
    const hired = await ensureStageOfKind(db, { ...fx, kind: "hired" });
    expect(hired.id).toBe(fx.stages.hired!.id);
  });

  it("creates a missing terminal stage once, even under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ensureStageOfKind(db, { ...fx, kind: "withdrawn" }),
      ),
    );
    expect(new Set(results.map((s) => s.id)).size).toBe(1);
    const rows = await db
      .select()
      .from(jobStages)
      .where(eq(jobStages.jobId, fx.jobId));
    expect(rows.filter((r) => r.kind === "withdrawn")).toHaveLength(1);
    expect(results[0].name).toBe("Withdrawn");
    expect(results[0].order).toBe(6);
  });

  it("recreates the default hired stage after the original was renamed away", async () => {
    const other = await fx.addJob();
    // Rename the hired stage and reclassify it, as an admin might.
    await db
      .update(jobStages)
      .set({ name: "Joined", kind: "custom" })
      .where(eq(jobStages.id, other.stages.hired!.id));
    const created = await ensureStageOfKind(db, {
      workspaceId: fx.workspaceId,
      jobId: other.jobId,
      kind: "hired",
    });
    expect(created.kind).toBe("hired");
    expect(created.id).not.toBe(other.stages.hired!.id);
    expect(created.name).toBe("Hired");
  });

  it("avoids a name collision with an unrelated stage", async () => {
    const other = await fx.addJob();
    await db
      .update(jobStages)
      .set({ kind: "custom" })
      .where(eq(jobStages.id, other.stages.hired!.id));
    const created = await ensureStageOfKind(db, {
      workspaceId: fx.workspaceId,
      jobId: other.jobId,
      kind: "hired",
    });
    expect(created.name).toBe("Hired (2)");
  });
});
