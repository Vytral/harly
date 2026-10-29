import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { applications, db, jobStages, member } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { getActionHandler, type ActionContext } from "./registry";

describe.skipIf(!runPipelineIntegration)("automation move_stage by stage name", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    // Automations act as their creator, and the handler resolves that creator's
    // role. The fixture owner is an owner (all-powerful) member.
    const now = new Date();
    await db.insert(member).values({
      id: `move-stage-owner-${fx.workspaceId}`,
      organizationId: fx.workspaceId,
      userId: fx.userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  async function runMoveStage(applicationId: string, jobId: string, toStageName: string) {
    const handler = getActionHandler("move_stage");
    if (!handler) throw new Error("move_stage is not registered");
    const ctx = {
      workspaceId: fx.workspaceId,
      database: db,
      actorUserId: fx.userId,
      triggerEvent: "application.created",
      triggerPayload: { application: { id: applicationId, jobId } },
      effectKey: `effect-${crypto.randomUUID()}`,
      runId: crypto.randomUUID(),
    } as unknown as ActionContext;
    return handler.run({ toStageName }, ctx);
  }

  // Renaming the existing row and then inserting a new one leaves the
  // lower-cased variant first in the table, which is where an unordered lookup
  // would find it. The exact-name stage is the one the workflow must pick.
  async function jobWithCaseVariants(variants: { name: string; order: number }[]) {
    const job = await fx.addJob();
    await db
      .update(jobStages)
      .set({ name: "interview" })
      .where(eq(jobStages.id, job.stages.interview!.id));
    const created: { id: string; name: string }[] = [];
    for (const variant of variants) {
      const [row] = await db
        .insert(jobStages)
        .values({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          name: variant.name,
          kind: "custom",
          order: variant.order,
        })
        .returning({ id: jobStages.id, name: jobStages.name });
      created.push(row!);
    }
    const { applicationId } = await fx.addApplication({
      stageId: job.stages.applied!.id,
      jobId: job.jobId,
    });
    return { jobId: job.jobId, applicationId, created, interviewId: job.stages.interview!.id };
  }

  it("prefers the stage whose name matches exactly over a case variant", async () => {
    const { jobId, applicationId, created } = await jobWithCaseVariants([
      { name: "Interview", order: 20 },
    ]);

    const result = await runMoveStage(applicationId, jobId, "Interview");

    expect(result.success).toBe(true);
    const [app] = await db
      .select({ stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(app!.stageId).toBe(created[0]!.id);
  });

  it("refuses to guess between case variants that do not include an exact match", async () => {
    const { jobId, applicationId, interviewId } = await jobWithCaseVariants([
      { name: "INTERVIEW", order: 20 },
    ]);

    const result = await runMoveStage(applicationId, jobId, "Interview");

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/ambiguous/i);
    const [app] = await db
      .select({ stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(app!.stageId).not.toBe(interviewId);
  });

  it("moves to the only case variant that exists", async () => {
    const { jobId, applicationId, interviewId } = await jobWithCaseVariants([]);

    const result = await runMoveStage(applicationId, jobId, "INTERVIEW");

    expect(result.success).toBe(true);
    const [app] = await db
      .select({ stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(app!.stageId).toBe(interviewId);
  });
});
