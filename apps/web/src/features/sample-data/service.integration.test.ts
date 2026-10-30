import { and, eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applicationStageHistory,
  applications,
  candidateTags,
  candidates,
  db,
  jobHiringTeam,
  jobStages,
  jobs,
  offers,
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

async function sampleCandidateIdByEmail(workspaceId: string, email: string) {
  const [row] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.workspaceId, workspaceId), eq(candidates.email, email)));
  return row.id;
}

async function sampleApplicationIdFor(workspaceId: string, candidateId: string) {
  const [row] = await db
    .select({ id: applications.id, jobId: applications.jobId, stageId: applications.currentStageId })
    .from(applications)
    .where(and(eq(applications.workspaceId, workspaceId), eq(applications.candidateId, candidateId)));
  return row;
}

describe.skipIf(!runPipelineIntegration)("removal never destroys real child rows", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function sampleJobId(workspaceId: string) {
    const [row] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.title, SAMPLE_JOB_TITLE)));
    return row.id;
  }

  it("keeps a sample application that has a real offer, with its candidate and job", async () => {
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`,
    );
    const application = await sampleApplicationIdFor(fixture.workspaceId, candidateId);
    const [offer] = await db
      .insert(offers)
      .values({
        workspaceId: fixture.workspaceId,
        applicationId: application.id,
        candidateId,
        jobId: application.jobId,
        title: "Real offer",
        createdById: fixture.userId,
      })
      .returning({ id: offers.id });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.keptRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "application",
          entityId: application.id,
          reason: expect.stringContaining("offers"),
        }),
      ]),
    );
    const [survivingOffer] = await db.select({ id: offers.id }).from(offers).where(eq(offers.id, offer.id));
    expect(survivingOffer).toBeDefined();
    const [keptApplication] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(keptApplication).toBeDefined();
    expect(await jobExists(application.jobId)).toBe(true);
    const [retained] = await db
      .select({ email: candidates.email })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    expect(retained.email).toMatch(/^retained-[0-9a-f]{8}\.amara\.okafor@sample\.invalid$/);
  });

  it("keeps a sample application that a user moved (real stage history row)", async () => {
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `liam.chen@${SAMPLE_EMAIL_DOMAIN}`,
    );
    const application = await sampleApplicationIdFor(fixture.workspaceId, candidateId);
    const [stage] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, application.jobId), eq(jobStages.kind, "screening")));
    const [history] = await db
      .insert(applicationStageHistory)
      .values({
        workspaceId: fixture.workspaceId,
        applicationId: application.id,
        fromStageId: application.stageId,
        toStageId: stage.id,
        movedById: fixture.userId,
      })
      .returning({ id: applicationStageHistory.id });

    await removeSampleData({ workspaceId: fixture.workspaceId });

    const [survivingHistory] = await db
      .select({ id: applicationStageHistory.id })
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.id, history.id));
    expect(survivingHistory).toBeDefined();
    const [keptApplication] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(keptApplication).toBeDefined();
  });

  it("keeps a sample candidate that has a real tag", async () => {
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `priya.raman@${SAMPLE_EMAIL_DOMAIN}`,
    );
    const [tag] = await db
      .insert(candidateTags)
      .values({ workspaceId: fixture.workspaceId, candidateId, label: "Referral" })
      .returning({ id: candidateTags.id });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.kept.candidates).toBe(1);
    const [survivingTag] = await db
      .select({ id: candidateTags.id })
      .from(candidateTags)
      .where(eq(candidateTags.id, tag.id));
    expect(survivingTag).toBeDefined();
    const [keptCandidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    expect(keptCandidate).toBeDefined();
  });

  it("keeps a sample job that has a real hiring team member", async () => {
    const jobId = await sampleJobId(fixture.workspaceId);
    const [member] = await db
      .insert(jobHiringTeam)
      .values({ workspaceId: fixture.workspaceId, jobId, userId: fixture.userId })
      .returning({ id: jobHiringTeam.id });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    if (removed.status !== "removed") return;
    expect(removed.kept.jobs).toBe(1);
    const [survivingMember] = await db
      .select({ id: jobHiringTeam.id })
      .from(jobHiringTeam)
      .where(eq(jobHiringTeam.id, member.id));
    expect(survivingMember).toBeDefined();
    expect(await jobExists(jobId)).toBe(true);
  });
});

describe.skipIf(!runPipelineIntegration)("removal keeps records that stopped being sample data", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("load succeeds again after a removal kept a candidate", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const amaraId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`,
    );
    await db.insert(applications).values({
      workspaceId: fixture.workspaceId,
      candidateId: amaraId,
      jobId: fixture.jobId,
      currentStageId: fixture.stages.applied!.id,
    });

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });
    expect(removed.status === "removed" && removed.kept.candidates).toBe(1);

    const reloaded = await loadSampleData({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.userId,
    });
    expect(reloaded.status).toBe("loaded");
    const amaraRows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, fixture.workspaceId),
          eq(candidates.email, `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`),
        ),
      );
    expect(amaraRows).toHaveLength(1);
    expect(amaraRows[0].id).not.toBe(amaraId);
  });

  it("a load blocked by a conflicting record reports a readable message, not database text", async () => {
    await db.insert(candidates).values({
      workspaceId: fixture.workspaceId,
      firstName: "Amara",
      lastName: "Okafor",
      email: `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`,
    });

    const error = await loadSampleData({
      workspaceId: fixture.workspaceId,
      actorUserId: fixture.userId,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/sample email/i);
    expect(message).not.toMatch(/insert|duplicate|violates|constraint|SQL|query|params/i);
  });

  it("keeps a candidate whose sample email was replaced with a real address", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `hannah.muller@${SAMPLE_EMAIL_DOMAIN}`,
    );
    await db
      .update(candidates)
      .set({ email: "hannah.real@example.test" })
      .where(eq(candidates.id, candidateId));

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status === "removed" && removed.kept.candidates).toBe(1);
    const [kept] = await db
      .select({ email: candidates.email })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    expect(kept.email).toBe("hannah.real@example.test");
  });

  it("keeps a sample job that a user published", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const jobId = (
      await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.workspaceId, fixture.workspaceId), eq(jobs.title, SAMPLE_JOB_TITLE)))
    )[0].id;
    await db
      .update(jobs)
      .set({ status: "open", publishedAt: new Date() })
      .where(eq(jobs.id, jobId));

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status === "removed" && removed.kept.jobs).toBe(1);
    expect(await jobExists(jobId)).toBe(true);
  });

  it("keeps a sample application that a user moved to a real job", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `mateo.rossi@${SAMPLE_EMAIL_DOMAIN}`,
    );
    const application = await sampleApplicationIdFor(fixture.workspaceId, candidateId);
    await db
      .update(applications)
      .set({ jobId: fixture.jobId, currentStageId: fixture.stages.applied!.id })
      .where(eq(applications.id, application.id));

    const removed = await removeSampleData({ workspaceId: fixture.workspaceId });

    expect(removed.status).toBe("removed");
    const [kept] = await db
      .select({ id: applications.id, jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(kept.jobId).toBe(fixture.jobId);
  });

  it("removal waits for a concurrent real stage move on a sample application", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const candidateId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `liam.chen@${SAMPLE_EMAIL_DOMAIN}`,
    );
    const application = await sampleApplicationIdFor(fixture.workspaceId, candidateId);
    const [stage] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(and(eq(jobStages.jobId, application.jobId), eq(jobStages.kind, "screening")));

    // A user moves the sample application. The history row takes a key-share
    // lock on the application, which is not committed until removal is running.
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let historyId = "";
    const mover = db.transaction(async (tx) => {
      const [row] = await tx
        .insert(applicationStageHistory)
        .values({
          workspaceId: fixture.workspaceId,
          applicationId: application.id,
          fromStageId: application.stageId,
          toStageId: stage.id,
          movedById: fixture.userId,
        })
        .returning({ id: applicationStageHistory.id });
      historyId = row.id;
      await hold;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const removal = removeSampleData({ workspaceId: fixture.workspaceId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await mover;
    const removed = await removal;

    expect(removed.status).toBe("removed");
    const [survivor] = await db
      .select({ id: applicationStageHistory.id })
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.id, historyId));
    expect(survivor).toBeDefined();
    const [kept] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, application.id));
    expect(kept).toBeDefined();
  });

  it("removal waits for a concurrent real application and keeps its candidate", async () => {
    await loadSampleData({ workspaceId: fixture.workspaceId, actorUserId: fixture.userId });
    const amaraId = await sampleCandidateIdByEmail(
      fixture.workspaceId,
      `amara.okafor@${SAMPLE_EMAIL_DOMAIN}`,
    );

    // A user's insert of a real application takes a key-share lock on the
    // sample candidate. It is not committed until the removal is under way.
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let realApplicationId = "";
    const inserter = db.transaction(async (tx) => {
      const [row] = await tx
        .insert(applications)
        .values({
          workspaceId: fixture.workspaceId,
          candidateId: amaraId,
          jobId: fixture.jobId,
          currentStageId: fixture.stages.applied!.id,
        })
        .returning({ id: applications.id });
      realApplicationId = row.id;
      await hold;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const removal = removeSampleData({ workspaceId: fixture.workspaceId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await inserter;
    const removed = await removal;

    expect(removed.status === "removed" && removed.kept.candidates).toBe(1);
    const [survivor] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, realApplicationId));
    expect(survivor).toBeDefined();
  });
});
