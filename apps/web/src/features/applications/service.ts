import "server-only";

import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  db,
  applications,
  applicationStageHistory,
  candidates,
  jobs,
  jobStages,
  type Application,
} from "@harly/db";

import { emitWebhookEvent } from "@/server/webhooks/emit";

/** Workspace-scoped application service for the REST API. */

export function serializeApplication(application: Application) {
  return {
    id: application.id,
    candidateId: application.candidateId,
    jobId: application.jobId,
    currentStageId: application.currentStageId,
    status: application.status,
    source: application.source,
    pipelineOrder: application.pipelineOrder,
    appliedAt: application.appliedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(applications.createdAt, createdAt),
    and(eq(applications.createdAt, createdAt), lt(applications.id, cursor.id)),
  );
}

export async function listApplicationsForApi(input: {
  workspaceId: string;
  jobId?: string;
  status?: Application["status"];
  cursor: Cursor | null;
  limit: number;
}): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        input.jobId ? eq(applications.jobId, input.jobId) : undefined,
        input.status ? eq(applications.status, input.status) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(applications.createdAt), desc(applications.id))
    .limit(input.limit + 1);
}

export async function getApplicationForApi(input: {
  workspaceId: string;
  applicationId: string;
}): Promise<Application> {
  const [application] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!application) throw ApiError.notFound("Application not found.");
  return application;
}

export async function createApplicationForApi(input: {
  workspaceId: string;
  jobId: string;
  candidateId: string;
  source?: string;
}): Promise<Application> {
  const { workspaceId, jobId, candidateId } = input;

  const application = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.workspaceId, workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .limit(1);
    if (!job) throw ApiError.notFound("Job not found.");

    const [candidate] = await tx
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.workspaceId, workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate) throw ApiError.notFound("Candidate not found.");

    const [duplicate] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.candidateId, candidateId),
          eq(applications.jobId, jobId),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw ApiError.conflict(
        "This candidate has already applied to this job.",
      );
    }

    const [firstStage] = await tx
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, workspaceId),
          eq(jobStages.jobId, jobId),
        ),
      )
      .orderBy(asc(jobStages.order))
      .limit(1);
    if (!firstStage) {
      throw ApiError.unprocessable("This job has no pipeline stages.");
    }

    const [nextOrder] = await tx
      .select({
        value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.currentStageId, firstStage.id),
        ),
      );

    const [created] = await tx
      .insert(applications)
      .values({
        workspaceId,
        candidateId,
        jobId,
        currentStageId: firstStage.id,
        pipelineOrder: nextOrder?.value ?? 1,
        source: input.source ?? "api",
        status: "active",
        appliedAt: new Date(),
      })
      .returning();

    await tx.insert(applicationStageHistory).values({
      workspaceId,
      applicationId: created.id,
      fromStageId: null,
      toStageId: firstStage.id,
      movedById: null,
    });

    return created;
  });

  await emitWebhookEvent(workspaceId, "application.created", {
    application: serializeApplication(application),
  });
  return application;
}

export async function moveApplicationStageForApi(input: {
  workspaceId: string;
  applicationId: string;
  toStageId: string;
}): Promise<Application> {
  const application = await getApplicationForApi({
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
  });

  if (application.currentStageId === input.toStageId) {
    return application;
  }

  const [stage] = await db
    .select({ id: jobStages.id })
    .from(jobStages)
    .where(
      and(
        eq(jobStages.id, input.toStageId),
        eq(jobStages.workspaceId, input.workspaceId),
        eq(jobStages.jobId, application.jobId),
      ),
    )
    .limit(1);
  if (!stage) {
    throw ApiError.unprocessable("Target stage does not belong to this job.");
  }

  const fromStageId = application.currentStageId;

  const [updated] = await db.transaction(async (tx) => {
    const [next] = await tx
      .select({
        value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1`,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.currentStageId, input.toStageId),
        ),
      );

    const result = await tx
      .update(applications)
      .set({
        currentStageId: input.toStageId,
        pipelineOrder: next?.value ?? 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.workspaceId, input.workspaceId),
        ),
      )
      .returning();

    await tx.insert(applicationStageHistory).values({
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      fromStageId,
      toStageId: input.toStageId,
      movedById: null,
    });

    return result;
  });

  await emitWebhookEvent(input.workspaceId, "application.stage_changed", {
    application: serializeApplication(updated),
    fromStageId,
    toStageId: input.toStageId,
  });
  return updated;
}

async function setApplicationStatus(
  input: { workspaceId: string; applicationId: string },
  status: Application["status"],
  event: "application.hired" | "application.rejected",
): Promise<Application> {
  await getApplicationForApi(input);
  const [updated] = await db
    .update(applications)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  await emitWebhookEvent(input.workspaceId, event, {
    application: serializeApplication(updated),
  });
  return updated;
}

export function hireApplicationForApi(input: {
  workspaceId: string;
  applicationId: string;
}): Promise<Application> {
  return setApplicationStatus(input, "hired", "application.hired");
}

export function rejectApplicationForApi(input: {
  workspaceId: string;
  applicationId: string;
}): Promise<Application> {
  return setApplicationStatus(input, "rejected", "application.rejected");
}
