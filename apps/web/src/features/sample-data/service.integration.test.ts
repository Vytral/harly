import { and, eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  sampleDataItems,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { SAMPLE_EMAIL_DOMAIN, SAMPLE_JOB_TITLE } from "./constants";
import {
  getSampleDataStatus,
  loadSampleData,
  removeSampleData,
} from "./service";

async function trackedByType(workspaceId: string) {
  const rows = await db
    .select({ entityType: sampleDataItems.entityType })
    .from(sampleDataItems)
    .where(eq(sampleDataItems.workspaceId, workspaceId));
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.entityType] = (counts[row.entityType] ?? 0) + 1;
  }
  return counts;
}

async function sampleCandidateCount(workspaceId: string) {
  const rows = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        like(candidates.email, `%@${SAMPLE_EMAIL_DOMAIN}`),
      ),
    );
  return rows.length;
}

async function jobExists(jobId: string) {
  const rows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId));
  return rows.length === 1;
}

describe.skipIf(!runPipelineIntegration)("sample data (database)", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("load creates the synthetic set and records every row it writes", async () => {
    const result = await loadSampleData({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.userId,
    });

    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") return;
    expect(result.counts).toEqual({
      jobs: 1,
      candidates: 8,
      applications: 8,
      notes: 3,
      interviews: 1,
    });

    expect(await trackedByType(fixture.workspaceId)).toEqual({
      job: 1,
      job_stage: 6,
      candidate: 8,
      application: 8,
      application_stage_history: 8,
      candidate_note: 3,
      interview: 1,
    });

    const [sampleJob] = await db
      .select({ status: jobs.status, title: jobs.title, publishedAt: jobs.publishedAt })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, fixture.workspaceId), eq(jobs.title, SAMPLE_JOB_TITLE)));
    expect(sampleJob.status).toBe("draft");
    expect(sampleJob.publishedAt).toBeNull();

    expect(await sampleCandidateCount(fixture.workspaceId)).toBe(8);
    expect((await getSampleDataStatus(fixture.workspaceId)).active).toBe(true);
  });

  it("loading twice changes nothing and reports the existing batch", async () => {
    const first = await loadSampleData({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.userId,
    });
    const before = await trackedByType(fixture.workspaceId);

    const second = await loadSampleData({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.userId,
    });

    expect(first.status).toBe("loaded");
    expect(second.status).toBe("already_loaded");
    if (first.status !== "loaded" || second.status !== "already_loaded") return;
    expect(second.batchId).toBe(first.batchId);
    expect(await trackedByType(fixture.workspaceId)).toEqual(before);
    expect(await sampleCandidateCount(fixture.workspaceId)).toBe(8);
  });

  it("remove deletes exactly the tracked rows and leaves real records alone", async () => {
    // A real job and application that exist before any sample data is loaded.
    const real = await fixture.addJob();
    const realApplication = await fixture.addApplication({
      stageId: fixture.stages.applied!.id,
    });
    const realApplicationOnOtherJob = await fixture.addApplication({
      stageId: real.stages.applied!.id,
      jobId: real.jobId,
    });

    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.deleted).toEqual({
      jobs: 1,
      candidates: 8,
      applications: 8,
      notes: 3,
      interviews: 1,
    });
    expect(removed.kept).toEqual({ jobs: 0, candidates: 0 });

    expect(await sampleCandidateCount(fixture.workspaceId)).toBe(0);
    expect(await trackedByType(fixture.workspaceId)).toEqual({});
    expect((await getSampleDataStatus(fixture.workspaceId)).active).toBe(false);

    // Everything that was there before the load survives untouched.
    expect(await jobExists(fixture.jobId)).toBe(true);
    expect(await jobExists(real.jobId)).toBe(true);
    const survivors = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.workspaceId, fixture.workspaceId));
    const survivorIds = survivors.map((row) => row.id).sort();
    expect(survivorIds).toEqual(
      [realApplication.applicationId, realApplicationOnOtherJob.applicationId].sort(),
    );
  });

  it("remove when no batch exists refuses and deletes nothing", async () => {
    const real = await fixture.addApplication({ stageId: fixture.stages.applied!.id });

    const result = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(result).toEqual({ status: "none" });
    const remaining = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, real.applicationId));
    expect(remaining).toHaveLength(1);
    expect(await jobExists(fixture.jobId)).toBe(true);
  });

  it("keeps a sample candidate that a real application still references", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const [amara] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, fixture.workspaceId),
          eq(candidates.email, `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`),
        ),
      );

    // A user adds the sample candidate to a real job after loading.
    const [realApplication] = await db
      .insert(applications)
      .values({
        workspaceId: fixture.workspaceId,
        candidateId: amara.id,
        jobId: fixture.jobId,
        currentStageId: fixture.stages.applied!.id,
      })
      .returning({ id: applications.id });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.kept).toEqual({ jobs: 0, candidates: 1 });
    expect(removed.deleted.candidates).toBe(7);

    const [kept] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.id, amara.id));
    expect(kept).toBeDefined();
    const [stillThere] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, realApplication.id));
    expect(stillThere).toBeDefined();
  });

  it("keeps a sample job that a real application still uses, stages included", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const [sampleJob] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, fixture.workspaceId), eq(jobs.title, SAMPLE_JOB_TITLE)));
    const [appliedStage] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, sampleJob.id), eq(jobStages.kind, "applied")));

    // A real candidate (created by the fixture) applies to the sample job.
    const real = await fixture.addApplication({ stageId: fixture.stages.applied!.id });
    await db.insert(applications).values({
      workspaceId: fixture.workspaceId,
      candidateId: real.candidateId,
      jobId: sampleJob.id,
      currentStageId: appliedStage.id,
    });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.kept.jobs).toBe(1);
    expect(await jobExists(sampleJob.id)).toBe(true);
    const stages = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(eq(jobStages.jobId, sampleJob.id));
    expect(stages).toHaveLength(6);
  });
});
