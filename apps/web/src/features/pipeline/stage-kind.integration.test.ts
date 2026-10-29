import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import {
  db,
  effectiveStageKind,
  effectiveStageKindSql,
  jobStages,
  stageIsKindSql,
  type StageKind,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

/** Names an older build (or a rollback) can leave behind with a NULL kind. */
const NAMES = [
  "Hired",
  "  hired  ",
  "Hired\t",
  "\tHired\n",
  " Hired ",
  "REJECTED",
  "Withdrawn ",
  "Offer",
  "Phone screen",
  "Hired (pending)",
  "Hi\tred",
  "Hired​",
  "",
  "   ",
];

describe.skipIf(!runPipelineIntegration)("stage kind: SQL helper matches TypeScript", () => {
  let fx: PipelineFixture;
  const ids = new Map<string, string>();

  beforeAll(async () => {
    fx = await createPipelineFixture();
    const jobFx = await fx.addJob();
    // Remove the default stages so the odd names cannot collide with them.
    await db.delete(jobStages).where(eq(jobStages.jobId, jobFx.jobId));
    const rows = await db
      .insert(jobStages)
      .values(
        NAMES.map((name, index) => ({
          workspaceId: fx.workspaceId,
          jobId: jobFx.jobId,
          name,
          order: index,
          kind: null,
        })),
      )
      .returning({ id: jobStages.id, name: jobStages.name });
    for (const row of rows) ids.set(row.id, row.name);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("classifies every NULL-kind name identically in SQL and TypeScript", async () => {
    const rows = await db
      .select({
        id: jobStages.id,
        name: jobStages.name,
        sqlKind: effectiveStageKindSql(jobStages),
        isHired: stageIsKindSql(jobStages, "hired"),
      })
      .from(jobStages)
      .where(inArray(jobStages.id, [...ids.keys()]));

    expect(rows).toHaveLength(NAMES.length);
    for (const row of rows) {
      const tsKind: StageKind = effectiveStageKind({ kind: null, name: row.name });
      expect(row.sqlKind, `name ${JSON.stringify(row.name)}`).toBe(tsKind);
      expect(row.isHired, `name ${JSON.stringify(row.name)}`).toBe(tsKind === "hired");
    }
  });

  it("prefers the stored kind over the name in SQL, like TypeScript", async () => {
    const [row] = await db
      .insert(jobStages)
      .values({
        workspaceId: fx.workspaceId,
        jobId: (await fx.addJob()).jobId,
        name: "Zzz custom hired lookalike",
        order: 99,
        kind: "hired",
      })
      .returning({ id: jobStages.id });
    const [check] = await db
      .select({ sqlKind: effectiveStageKindSql(jobStages) })
      .from(jobStages)
      .where(eq(jobStages.id, row.id));
    expect(check.sqlKind).toBe("hired");
  });
});
