import "server-only";

import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  db,
  applications,
  applicationStageHistory,
  candidatePortalNotifications,
  candidates,
  jobs,
  jobStages,
  organization,
  workspaceSettings,
  type Application,
} from "@harly/db";

import { emitWebhookEvent } from "@/server/webhooks/emit";
import { createLogger } from "@/lib/logger";
import { withConcurrencyRetry } from "@/lib/concurrent";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";

/** Workspace-scoped application service for the REST API. */
const log = createLogger("applications");

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

async function notifyApplicationStatusChange(input: {
  workspaceId: string;
  application: Application;
  status: "hired" | "rejected";
}) {
  const [settings] = await db
    .select({
      showApplicationStatus: workspaceSettings.portalShowApplicationStatus,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, input.workspaceId))
    .limit(1);
  const [details] = await db
    .select({
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobTitle: jobs.title,
      workspaceName: organization.name,
    })
    .from(candidates)
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, input.application.jobId),
        eq(jobs.workspaceId, input.workspaceId),
      ),
    )
    .innerJoin(organization, eq(organization.id, input.workspaceId))
    .where(
      and(
        eq(candidates.id, input.application.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!details) return;

  if (settings?.showApplicationStatus !== false) {
    await db.insert(candidatePortalNotifications).values({
      workspaceId: input.workspaceId,
      candidateId: input.application.candidateId,
      type:
        input.status === "hired" ? "application_hired" : "application_rejected",
      title:
        input.status === "hired"
          ? `Congratulations! You've been hired for ${details.jobTitle}`
          : `Application for ${details.jobTitle} not selected`,
      body:
        input.status === "hired"
          ? "We're excited to have you on the team!"
          : "We appreciate your interest and encourage you to apply for other roles.",
      href: `/portal/applications/${input.application.id}`,
      metadata: { applicationId: input.application.id, status: input.status },
    });
  }

  if (input.status === "rejected" && details.email) {
    const id = await enqueueEmailOutbox(
      input.workspaceId,
      "pipeline.rejected",
      {
        candidateEmail: details.email,
        candidateName: `${details.firstName} ${details.lastName}`,
        jobTitle: details.jobTitle,
        workspaceName: details.workspaceName,
        type: "rejected",
      },
    );
    await processEmailOutbox({ ids: [id], workspaceId: input.workspaceId });
  }
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

    const [firstStage] = await tx
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, jobId)),
      )
      .orderBy(asc(jobStages.order))
      .limit(1);
    if (!firstStage) {
      throw ApiError.unprocessable("This job has no pipeline stages.");
    }

    // Serialise writes entering one stage. Besides preserving pipeline order,
    // this makes the duplicate read below safe under concurrent API requests.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId} || ':' || ${firstStage.id}))`,
    );

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

export type BulkApplicationItem =
  | {
      candidateId: string;
      outcome: "created";
      application: Application;
    }
  | {
      candidateId: string;
      outcome: "conflict" | "failed";
      error: { code: string; message: string };
    };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function createBulkItem(input: {
  workspaceId: string;
  jobId: string;
  candidateId: string;
  source?: string;
}): Promise<BulkApplicationItem> {
  try {
    const application = await createApplicationForApi(input);
    return { candidateId: input.candidateId, outcome: "created", application };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        candidateId: input.candidateId,
        outcome: error.code === "conflict" ? "conflict" : "failed",
        error: { code: error.code, message: error.message },
      };
    }
    if (isUniqueViolation(error)) {
      return {
        candidateId: input.candidateId,
        outcome: "conflict",
        error: {
          code: "conflict",
          message: "This candidate has already applied to this job.",
        },
      };
    }
    console.error("[api] bulk application item failed", error);
    return {
      candidateId: input.candidateId,
      outcome: "failed",
      error: { code: "internal", message: "Could not create application." },
    };
  }
}

/**
 * Create up to 100 applications with independent transactions. A bad or
 * duplicate candidate never rolls back successful siblings; result order
 * exactly matches `candidateIds`.
 */
export async function createApplicationsBulkForApi(input: {
  workspaceId: string;
  jobId: string;
  candidateIds: string[];
  source?: string;
}): Promise<BulkApplicationItem[]> {
  // Creation assigns a pipeline order from the current stage maximum. Keep a
  // bulk request serial so its own items never race for that value.
  const results: BulkApplicationItem[] = [];
  for (const candidateId of input.candidateIds) {
    results.push(
      await createBulkItem({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        candidateId,
        source: input.source,
      }),
    );
  }

  return results;
}

export async function moveApplicationStageForApi(input: {
  workspaceId: string;
  applicationId: string;
  toStageId: string;
  retryOnConflict?: boolean;
}): Promise<Application> {
  const attemptMove = async (): Promise<Application> => {
    const application = await getApplicationForApi({
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
    });

    if (application.currentStageId === input.toStageId) {
      return application;
    }

    const [stage] = await db
      .select({ id: jobStages.id, name: jobStages.name })
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
          ...(stage.name.toLowerCase() === "rejected"
            ? { status: "rejected" }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.id, input.applicationId),
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.updatedAt, application.updatedAt),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw ApiError.conflict("Application changed; retry request.");
      }

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
  };

  return input.retryOnConflict
    ? withConcurrencyRetry(attemptMove, {
        isConflict: (error) =>
          error instanceof ApiError
            ? error.code === "conflict"
            : (error as { code?: string } | null)?.code === "conflict",
        onExhausted: (error, attempts) =>
          log.error(
            { error, attempts, applicationId: input.applicationId },
            "moveApplicationStageForApi exhausted concurrency retries",
          ),
      })
    : attemptMove();
}

async function setApplicationStatus(
  input: { workspaceId: string; applicationId: string; retryOnConflict?: boolean },
  status: "hired" | "rejected",
  event: "application.hired" | "application.rejected",
): Promise<Application> {
  const attemptStatus = async (): Promise<Application> => {
    const application = await getApplicationForApi(input);
    const terminalStageName = status === "hired" ? "Hired" : "Rejected";
    const [terminalStage] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, input.workspaceId),
          eq(jobStages.jobId, application.jobId),
          eq(jobStages.name, terminalStageName),
        ),
      )
      .limit(1);

    const [updated] = await db.transaction(async (tx) => {
      const [next] = await tx
        .update(applications)
        .set({
          status,
          ...(terminalStage ? { currentStageId: terminalStage.id } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.id, input.applicationId),
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.updatedAt, application.updatedAt),
          ),
        )
        .returning();
      if (!next) throw ApiError.conflict("Application changed; retry request.");

      if (terminalStage && terminalStage.id !== application.currentStageId) {
        await tx.insert(applicationStageHistory).values({
          workspaceId: input.workspaceId,
          applicationId: input.applicationId,
          fromStageId: application.currentStageId,
          toStageId: terminalStage.id,
          movedById: null,
        });
      }
      return [next];
    });

    await emitWebhookEvent(input.workspaceId, event, {
      application: serializeApplication(updated),
    });
    if (application.status !== status) {
      await notifyApplicationStatusChange({
        workspaceId: input.workspaceId,
        application: updated,
        status,
      });
    }
    return updated;
  };

  return input.retryOnConflict
    ? withConcurrencyRetry(attemptStatus, {
        isConflict: (error) =>
          error instanceof ApiError
            ? error.code === "conflict"
            : (error as { code?: string } | null)?.code === "conflict",
        onExhausted: (error, attempts) =>
          log.error(
            { error, attempts, applicationId: input.applicationId },
            "setApplicationStatus exhausted concurrency retries",
          ),
      })
    : attemptStatus();
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
