import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, jobStages } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  requirePermission: vi.fn(async () => undefined),
  requireJobPermission: vi.fn(async () => undefined),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: ctx.workspaceId },
    user: { id: ctx.userId },
  }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: ctx.requirePermission,
  requireJobPermission: ctx.requireJobPermission,
  requireApplicationPermission: async () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateStageEmailSettings } from "./actions";

describe.skipIf(!runPipelineIntegration)("updateStageEmailSettings", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.userId;
  });
  afterAll(async () => {
    await fx?.cleanup();
  });
  beforeEach(() => {
    ctx.requirePermission.mockReset().mockResolvedValue(undefined);
    ctx.requireJobPermission.mockReset().mockResolvedValue(undefined);
  });

  async function emailConfigOf(stageId: string) {
    const [row] = await db
      .select({ emailConfig: jobStages.emailConfig })
      .from(jobStages)
      .where(eq(jobStages.id, stageId));
    return row!.emailConfig;
  }

  async function setOff(stageId: string) {
    await db
      .update(jobStages)
      .set({ emailConfig: { candidateUpdatesEnabled: false } })
      .where(eq(jobStages.id, stageId));
  }

  it("lets a user with the job's edit permission and settings access toggle the stage", async () => {
    const job = await fx.addJob();
    const stage = job.stages.screening!;
    await setOff(stage.id);

    const result = await updateStageEmailSettings({
      workspaceId: fx.workspaceId,
      jobId: job.jobId,
      stageId: stage.id,
      candidateUpdatesEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(ctx.requireJobPermission).toHaveBeenCalledWith("jobs:edit", job.jobId);
    expect(await emailConfigOf(stage.id)).toEqual({ candidateUpdatesEnabled: true });
  });

  it("refuses a user who cannot edit this job, even with workspace settings access", async () => {
    const job = await fx.addJob();
    const stage = job.stages.screening!;
    await setOff(stage.id);
    ctx.requireJobPermission.mockRejectedValue(new Error("You are not assigned to this job."));

    const result = await updateStageEmailSettings({
      workspaceId: fx.workspaceId,
      jobId: job.jobId,
      stageId: stage.id,
      candidateUpdatesEnabled: true,
    });

    expect(result.success).toBe(false);
    expect(await emailConfigOf(stage.id)).toEqual({ candidateUpdatesEnabled: false });
  });

  it("refuses an archived stage", async () => {
    const job = await fx.addJob();
    const stage = job.stages.screening!;
    await setOff(stage.id);
    await db
      .update(jobStages)
      .set({ archivedAt: new Date() })
      .where(eq(jobStages.id, stage.id));

    const result = await updateStageEmailSettings({
      workspaceId: fx.workspaceId,
      jobId: job.jobId,
      stageId: stage.id,
      candidateUpdatesEnabled: true,
    });

    expect(result.success).toBe(false);
    expect(await emailConfigOf(stage.id)).toEqual({ candidateUpdatesEnabled: false });
  });
});
