import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  applicationStatusForStageKind,
  candidateNotes,
  candidates,
  db,
  defaultStageRows,
  interviews,
  jobStages,
  jobs,
  sampleDataItems,
  type StageKind,
} from "@harly/db";

import {
  SAMPLE_JOB_SLUG_BASE,
  type SampleEntityType,
} from "./constants";
import { buildSampleDataset } from "./dataset";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SampleDataCounts = {
  jobs: number;
  candidates: number;
  applications: number;
  notes: number;
  interviews: number;
};

export type LoadSampleDataResult =
  | { status: "loaded"; batchId: string; counts: SampleDataCounts }
  | { status: "already_loaded"; batchId: string };

export type RemoveSampleDataResult =
  | {
      status: "removed";
      batchId: string;
      deleted: SampleDataCounts;
      /** Tracked sample rows kept because a real record still depends on them. */
      kept: { jobs: number; candidates: number };
    }
  | { status: "none" };

/** Serialises load and remove per workspace so two clicks cannot interleave. */
function lockWorkspace(tx: Transaction, workspaceId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`,
  );
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** A moment on a whole day offset from `now`, at 10:00 UTC. */
function utcMorningOffset(now: Date, days: number): Date {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() + days);
  result.setUTCHours(10, 0, 0, 0);
  return result;
}

/**
 * Create the synthetic job, pipeline, candidates, applications, notes and one
 * interview, recording every row in sample_data_items. A second call while a
 * batch exists changes nothing.
 */
export async function loadSampleData(input: {
  workspaceId: string;
  actorUserId: string;
  now?: Date;
}): Promise<LoadSampleDataResult> {
  const { workspaceId, actorUserId } = input;
  const now = input.now ?? new Date();
  const dataset = buildSampleDataset();

  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);

    const [existing] = await tx
      .select({ batchId: sampleDataItems.batchId })
      .from(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId))
      .limit(1);
    if (existing) {
      return { status: "already_loaded", batchId: existing.batchId };
    }

    const batchId = randomUUID();
    const tracked: Array<{
      workspaceId: string;
      entityType: SampleEntityType;
      entityId: string;
      batchId: string;
    }> = [];
    const track = (entityType: SampleEntityType, entityId: string) => {
      tracked.push({ workspaceId, entityType, entityId, batchId });
    };

    // Draft on purpose: the public board only lists open jobs, so the sample
    // can never reach candidates unless someone publishes it explicitly.
    const [job] = await tx
      .insert(jobs)
      .values({
        workspaceId,
        title: dataset.job.title,
        slug: `${SAMPLE_JOB_SLUG_BASE}-${batchId.slice(0, 8)}`,
        department: dataset.job.department,
        location: dataset.job.location,
        employmentType: dataset.job.employmentType,
        workplaceType: dataset.job.workplaceType,
        description: dataset.job.description,
        status: "draft",
        publishedAt: null,
        createdById: actorUserId,
      })
      .returning({ id: jobs.id });
    track("job", job.id);

    const stageRows = await tx
      .insert(jobStages)
      .values(defaultStageRows({ workspaceId, jobId: job.id }))
      .returning({ id: jobStages.id, kind: jobStages.kind });
    const stageIdByKind = new Map<StageKind, string>();
    for (const stage of stageRows) {
      track("job_stage", stage.id);
      if (stage.kind) stageIdByKind.set(stage.kind, stage.id);
    }

    const candidateIdByKey = new Map<string, string>();
    const applicationIdByKey = new Map<string, string>();

    for (const [index, plan] of dataset.candidates.entries()) {
      const [candidate] = await tx
        .insert(candidates)
        .values({
          workspaceId,
          firstName: plan.firstName,
          lastName: plan.lastName,
          email: plan.email,
          headline: plan.headline,
          summary: plan.summary,
          skills: plan.skills,
        })
        .returning({ id: candidates.id });
      track("candidate", candidate.id);
      candidateIdByKey.set(plan.key, candidate.id);

      const stageId = stageIdByKind.get(plan.stage);
      if (!stageId) {
        throw new Error(`The default pipeline has no ${plan.stage} stage.`);
      }
      const appliedAt = daysBefore(now, plan.appliedDaysAgo);
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId,
          candidateId: candidate.id,
          jobId: job.id,
          currentStageId: stageId,
          pipelineOrder: index,
          source: plan.source,
          status: applicationStatusForStageKind(plan.stage),
          appliedAt,
        })
        .returning({ id: applications.id });
      track("application", application.id);
      applicationIdByKey.set(plan.key, application.id);

      const [history] = await tx
        .insert(applicationStageHistory)
        .values({
          workspaceId,
          applicationId: application.id,
          fromStageId: null,
          toStageId: stageId,
          movedById: actorUserId,
          createdAt: appliedAt,
        })
        .returning({ id: applicationStageHistory.id });
      track("application_stage_history", history.id);
    }

    for (const note of dataset.notes) {
      const candidateId = candidateIdByKey.get(note.candidateKey);
      if (!candidateId) continue;
      const [row] = await tx
        .insert(candidateNotes)
        .values({
          workspaceId,
          candidateId,
          authorId: actorUserId,
          body: note.body,
        })
        .returning({ id: candidateNotes.id });
      track("candidate_note", row.id);
    }

    for (const plan of dataset.interviews) {
      const candidateId = candidateIdByKey.get(plan.candidateKey);
      const applicationId = applicationIdByKey.get(plan.candidateKey);
      if (!candidateId || !applicationId) continue;
      const [row] = await tx
        .insert(interviews)
        .values({
          workspaceId,
          applicationId,
          jobId: job.id,
          candidateId,
          interviewerId: actorUserId,
          title: plan.title,
          type: plan.type,
          mode: plan.mode,
          status: "scheduled",
          scheduledAt: utcMorningOffset(now, plan.daysFromNow),
        })
        .returning({ id: interviews.id });
      track("interview", row.id);
    }

    await tx.insert(sampleDataItems).values(tracked);

    return {
      status: "loaded",
      batchId,
      counts: {
        jobs: 1,
        candidates: dataset.candidates.length,
        applications: dataset.candidates.length,
        notes: dataset.notes.length,
        interviews: dataset.interviews.length,
      },
    };
  });
}

/**
 * Delete exactly the rows the sample batch created, children first so every
 * foreign key is satisfied. Anything a user added afterwards is left alone,
 * with two consequences:
 *
 * - Notes and interviews on a sample candidate go with that candidate, because
 *   they cannot exist without it.
 * - A sample job or candidate that a real application still references is kept
 *   (and stops being tracked), so that application is never deleted by cascade.
 */
export async function removeSampleData(input: {
  workspaceId: string;
}): Promise<RemoveSampleDataResult> {
  const { workspaceId } = input;

  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);

    const tracked = await tx
      .select({
        entityType: sampleDataItems.entityType,
        entityId: sampleDataItems.entityId,
        batchId: sampleDataItems.batchId,
      })
      .from(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId));
    if (tracked.length === 0) return { status: "none" };

    const batchId = tracked[0].batchId;
    const idsOf = (type: SampleEntityType) =>
      tracked
        .filter((row) => row.entityType === type)
        .map((row) => row.entityId);
    const trackedCandidates = idsOf("candidate");
    const trackedJobs = idsOf("job");
    const trackedApplications = idsOf("application");
    const trackedInterviews = idsOf("interview");
    const trackedNotes = idsOf("candidate_note");
    const trackedHistory = idsOf("application_stage_history");

    // Real applications that hang off a tracked candidate or job. Deleting the
    // parent would cascade them away, so such parents are kept instead.
    const scope: SQL[] = [];
    if (trackedCandidates.length > 0) {
      scope.push(inArray(applications.candidateId, trackedCandidates));
    }
    if (trackedJobs.length > 0) {
      scope.push(inArray(applications.jobId, trackedJobs));
    }
    const dependentApplications =
      scope.length === 0
        ? []
        : await tx
            .select({
              id: applications.id,
              candidateId: applications.candidateId,
              jobId: applications.jobId,
            })
            .from(applications)
            .where(
              and(
                eq(applications.workspaceId, workspaceId),
                scope.length === 1 ? scope[0] : or(...scope),
              ),
            );

    const trackedApplicationSet = new Set(trackedApplications);
    const userApplications = dependentApplications.filter(
      (row) => !trackedApplicationSet.has(row.id),
    );
    const trackedCandidateSet = new Set(trackedCandidates);
    const trackedJobSet = new Set(trackedJobs);
    const keptCandidates = new Set(
      userApplications
        .map((row) => row.candidateId)
        .filter((id) => trackedCandidateSet.has(id)),
    );
    const keptJobs = new Set(
      userApplications
        .map((row) => row.jobId)
        .filter((id) => trackedJobSet.has(id)),
    );

    const deleted: SampleDataCounts = {
      jobs: 0,
      candidates: 0,
      applications: 0,
      notes: 0,
      interviews: 0,
    };

    if (trackedInterviews.length > 0) {
      const rows = await tx
        .delete(interviews)
        .where(
          and(
            eq(interviews.workspaceId, workspaceId),
            inArray(interviews.id, trackedInterviews),
          ),
        )
        .returning({ id: interviews.id });
      deleted.interviews = rows.length;
    }

    if (trackedNotes.length > 0) {
      const rows = await tx
        .delete(candidateNotes)
        .where(
          and(
            eq(candidateNotes.workspaceId, workspaceId),
            inArray(candidateNotes.id, trackedNotes),
          ),
        )
        .returning({ id: candidateNotes.id });
      deleted.notes = rows.length;
    }

    if (trackedHistory.length > 0) {
      await tx
        .delete(applicationStageHistory)
        .where(
          and(
            eq(applicationStageHistory.workspaceId, workspaceId),
            inArray(applicationStageHistory.id, trackedHistory),
          ),
        );
    }

    if (trackedApplications.length > 0) {
      const rows = await tx
        .delete(applications)
        .where(
          and(
            eq(applications.workspaceId, workspaceId),
            inArray(applications.id, trackedApplications),
          ),
        )
        .returning({ id: applications.id });
      deleted.applications = rows.length;
    }

    const removableCandidates = trackedCandidates.filter(
      (id) => !keptCandidates.has(id),
    );
    if (removableCandidates.length > 0) {
      const rows = await tx
        .delete(candidates)
        .where(
          and(
            eq(candidates.workspaceId, workspaceId),
            inArray(candidates.id, removableCandidates),
          ),
        )
        .returning({ id: candidates.id });
      deleted.candidates = rows.length;
    }

    const removableJobs = trackedJobs.filter((id) => !keptJobs.has(id));
    if (removableJobs.length > 0) {
      // Deleting a job cascades to its stages, hiring team and questions.
      const rows = await tx
        .delete(jobs)
        .where(and(eq(jobs.workspaceId, workspaceId), inArray(jobs.id, removableJobs)))
        .returning({ id: jobs.id });
      deleted.jobs = rows.length;
    }

    await tx
      .delete(sampleDataItems)
      .where(eq(sampleDataItems.workspaceId, workspaceId));

    return {
      status: "removed",
      batchId,
      deleted,
      kept: { jobs: keptJobs.size, candidates: keptCandidates.size },
    };
  });
}

/** Whether a sample batch is currently tracked for the workspace. */
export async function getSampleDataStatus(workspaceId: string): Promise<{
  active: boolean;
  batchId: string | null;
}> {
  const [row] = await db
    .select({ batchId: sampleDataItems.batchId })
    .from(sampleDataItems)
    .where(eq(sampleDataItems.workspaceId, workspaceId))
    .limit(1);
  return { active: Boolean(row), batchId: row?.batchId ?? null };
}
