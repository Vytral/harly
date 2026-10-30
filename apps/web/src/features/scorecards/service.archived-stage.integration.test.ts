import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { applications, db, jobStages, member, scorecards } from "@harly/db";

import { createAuthorizationFixture, type AuthorizationFixture } from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

import { createScorecardForApi } from "./service";

describe.skipIf(!runPipelineIntegration)("REST scorecard stage resolution (database)", () => {
  let fx: AuthorizationFixture;
  let archivedStageId: string;
  let applicationId: string;

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const now = new Date();
    await db.insert(member).values({
      id: `scorecard-actor-${fx.workspaceId}`,
      organizationId: fx.workspaceId,
      userId: fx.users.full,
      role: fx.roleKeys.full,
      createdAt: now,
      updatedAt: now,
    });
    const [archived] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, fx.jobA), eq(jobStages.name, fx.archivedStageName)));
    archivedStageId = archived!.id;
    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, fx.candidateA));
    applicationId = app!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  function scorecardFor(stage: { stageId?: string; stageName?: string }) {
    return createScorecardForApi({
      workspaceId: fx.workspaceId,
      actorUserId: fx.users.full,
      values: {
        candidateId: fx.candidateA,
        applicationId,
        rating: "strong",
        ...stage,
      },
    });
  }

  it("refuses to file a scorecard against an archived stage by name", async () => {
    await expect(scorecardFor({ stageName: fx.archivedStageName })).rejects.toThrow(/archived/i);
  });

  it("refuses to file a scorecard against an archived stage by id", async () => {
    await expect(scorecardFor({ stageId: archivedStageId })).rejects.toThrow(/archived/i);
    const stored = await db
      .select({ id: scorecards.id })
      .from(scorecards)
      .where(eq(scorecards.stageId, archivedStageId));
    expect(stored).toHaveLength(0);
  });

  it("files a scorecard against an active stage looked up by name", async () => {
    const screening = fx.stagesA.screening!;
    const created = await scorecardFor({ stageName: screening.name });
    expect(created).toMatchObject({ stageId: screening.id, stageName: screening.name });
  });
});
