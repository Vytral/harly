import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  candidates,
  db,
  defaultStageRows,
  jobStages,
  jobs,
  organization,
  user,
  type JobStage,
  type StageKind,
} from "@harly/db";

/**
 * Opt-in switch for integration tests that need a migrated Postgres
 * (`DATABASE_URL`). CI sets it in the integration job; locally run
 * `RUN_PIPELINE_STAGE_INTEGRATION=1 pnpm --filter web exec vitest run <file>`.
 */
export const runPipelineIntegration =
  process.env.RUN_PIPELINE_STAGE_INTEGRATION === "1";

export type PipelineFixture = {
  workspaceId: string;
  userId: string;
  jobId: string;
  /** Default pipeline stages keyed by kind. */
  stages: Partial<Record<StageKind, JobStage>>;
  /** Insert a candidate with an application sitting in `stageId`. */
  addApplication: (input: {
    stageId: string;
    status?: "active" | "hired" | "rejected" | "withdrawn";
    jobId?: string;
  }) => Promise<{ applicationId: string; candidateId: string }>;
  /** Create another job in the same workspace with the default pipeline. */
  addJob: () => Promise<{ jobId: string; stages: Partial<Record<StageKind, JobStage>> }>;
  cleanup: () => Promise<void>;
};

/**
 * Synthetic workspace + owner + one open job with the default six-stage
 * pipeline. Every row is namespaced by a random id, so tests can run in
 * parallel against a shared database; `cleanup()` removes the workspace and
 * everything cascading from it.
 */
export async function createPipelineFixture(): Promise<PipelineFixture> {
  const tag = randomUUID().slice(0, 8);
  const workspaceId = `fixture-${tag}`;
  const userId = `fixture-user-${tag}`;

  await db.insert(organization).values({
    id: workspaceId,
    name: `Fixture ${tag}`,
    slug: `fixture-${tag}`,
    createdAt: new Date(),
  });
  await db.insert(user).values({
    id: userId,
    name: `Fixture ${tag}`,
    email: `fixture-${tag}@example.test`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  async function addJob() {
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      workspaceId,
      title: `Fixture job ${jobId.slice(0, 4)}`,
      slug: `fixture-job-${jobId.slice(0, 8)}`,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Synthetic integration fixture",
      status: "open",
      publishedAt: new Date(),
      createdById: userId,
    });
    const rows = await db
      .insert(jobStages)
      .values(defaultStageRows({ workspaceId, jobId }))
      .returning();
    const stages: Partial<Record<StageKind, JobStage>> = {};
    for (const row of rows) if (row.kind) stages[row.kind] = row;
    return { jobId, stages };
  }

  const first = await addJob();

  return {
    workspaceId,
    userId,
    jobId: first.jobId,
    stages: first.stages,
    addJob,
    async addApplication({ stageId, status = "active", jobId = first.jobId }) {
      const [candidate] = await db
        .insert(candidates)
        .values({
          workspaceId,
          firstName: "Fixture",
          lastName: randomUUID().slice(0, 6),
          email: `candidate-${randomUUID()}@example.test`,
        })
        .returning({ id: candidates.id });
      const [application] = await db
        .insert(applications)
        .values({
          workspaceId,
          candidateId: candidate.id,
          jobId,
          currentStageId: stageId,
          status,
        })
        .returning({ id: applications.id });
      await db.insert(applicationStageHistory).values({
        workspaceId,
        applicationId: application.id,
        fromStageId: null,
        toStageId: stageId,
        movedById: userId,
      });
      return { applicationId: application.id, candidateId: candidate.id };
    },
    async cleanup() {
      await db.delete(organization).where(eq(organization.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    },
  };
}
