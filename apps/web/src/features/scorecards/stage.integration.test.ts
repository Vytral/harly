import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, jobStages } from "@harly/db";
import { and, eq } from "drizzle-orm";

import { createAuthorizationFixture, type AuthorizationFixture } from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

import { findActiveJobStage } from "./stage";

describe.skipIf(!runPipelineIntegration)("findActiveJobStage (database)", () => {
  let fx: AuthorizationFixture;
  let archivedId: string;

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const [archived] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, fx.jobA), eq(jobStages.name, fx.archivedStageName)));
    archivedId = archived!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("finds an active stage by id and by name", async () => {
    const screening = fx.stagesA.screening!;
    const base = { workspaceId: fx.workspaceId, jobId: fx.jobA };
    expect(await findActiveJobStage(db, { ...base, stageId: screening.id })).toEqual({
      id: screening.id,
      name: screening.name,
    });
    expect(await findActiveJobStage(db, { ...base, stageName: screening.name })).toEqual({
      id: screening.id,
      name: screening.name,
    });
  });

  it("returns null without a stage id or name", async () => {
    expect(await findActiveJobStage(db, { workspaceId: fx.workspaceId, jobId: fx.jobA })).toBeNull();
    expect(
      await findActiveJobStage(db, { workspaceId: fx.workspaceId, jobId: fx.jobA, stageId: "", stageName: null }),
    ).toBeNull();
  });

  it("refuses archived stages, by id and by name", async () => {
    const base = { workspaceId: fx.workspaceId, jobId: fx.jobA };
    expect(await findActiveJobStage(db, { ...base, stageId: archivedId })).toBeNull();
    expect(await findActiveJobStage(db, { ...base, stageName: fx.archivedStageName })).toBeNull();
  });

  it("refuses a stage that belongs to another job or workspace", async () => {
    const otherJobStage = fx.stagesB.screening!;
    expect(
      await findActiveJobStage(db, { workspaceId: fx.workspaceId, jobId: fx.jobA, stageId: otherJobStage.id }),
    ).toBeNull();
    expect(
      await findActiveJobStage(db, {
        workspaceId: fx.otherWorkspaceCandidate.workspaceId,
        jobId: fx.jobA,
        stageId: fx.stagesA.screening!.id,
      }),
    ).toBeNull();
  });
});
