import "server-only";

import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  activityEvents,
  applications,
  candidates,
  db,
  interviews,
  jobs,
  type Interview,
} from "@harly/db";

import { emitWebhookEvent } from "@/server/webhooks/emit";

import { findWorkspaceMember } from "./core";

/** Workspace-scoped, session-free interview service for REST API handlers. */

export const INTERVIEW_TYPES = [
  "screening",
  "culture_fit",
  "technical",
  "onsite",
  "final",
] as const;

export const INTERVIEW_MODES = ["video", "phone", "onsite"] as const;
export const INTERVIEW_STATUSES = ["scheduled", "completed", "canceled"] as const;

export type InterviewApiInput = {
  applicationId: string;
  candidateId: string;
  interviewerId?: string | null;
  title?: string | null;
  type: (typeof INTERVIEW_TYPES)[number];
  mode: (typeof INTERVIEW_MODES)[number];
  scheduledAt: Date;
  durationMins: number;
  location?: string | null;
  notes?: string | null;
};

export type InterviewApiUpdate = Partial<
  Omit<InterviewApiInput, "applicationId" | "candidateId">
>;

export function serializeInterview(interview: Interview) {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    candidateId: interview.candidateId,
    jobId: interview.jobId,
    interviewerId: interview.interviewerId,
    title: interview.title,
    type: interview.type,
    mode: interview.mode,
    status: interview.status,
    scheduledAt: interview.scheduledAt.toISOString(),
    durationMins: interview.durationMins,
    location: interview.location,
    notes: interview.notes,
    source: interview.source,
    meetingUrl: interview.meetLink,
    createdAt: interview.createdAt.toISOString(),
    updatedAt: interview.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(interviews.createdAt, createdAt),
    and(eq(interviews.createdAt, createdAt), lt(interviews.id, cursor.id)),
  );
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const row = await findWorkspaceMember(workspaceId, userId);
  if (!row) throw ApiError.forbidden("User is not a member of this workspace.");
}

async function assertInterviewerMember(
  workspaceId: string,
  interviewerId: string | null | undefined,
) {
  if (interviewerId) await assertWorkspaceMember(workspaceId, interviewerId);
}

/** A scheduled interview time must be in the future. Past times produce a
 *  "scheduled" row the candidate gets an email for but that never surfaces in
 *  the upcoming list (which filters gte(now)), so the recruiter loses it. */
function assertFutureWhen(when: Date) {
  if (when.getTime() < Date.now()) {
    throw ApiError.unprocessable("Interview time must be in the future.");
  }
}

async function assertNoInterviewerConflict(input: {
  workspaceId: string;
  interviewerId: string | null;
  scheduledAt: Date;
  durationMins: number;
  excludeInterviewId?: string;
}) {
  if (!input.interviewerId) return;
  const [conflict] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(
      and(
        eq(interviews.workspaceId, input.workspaceId),
        eq(interviews.interviewerId, input.interviewerId),
        eq(interviews.status, "scheduled"),
        input.excludeInterviewId
          ? ne(interviews.id, input.excludeInterviewId)
          : undefined,
        sql`${interviews.scheduledAt} < ${new Date(input.scheduledAt.getTime() + input.durationMins * 60_000)}`,
        sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${input.scheduledAt}`,
      ),
    )
    .limit(1);
  if (conflict) {
    throw ApiError.conflict("This interviewer already has an overlapping interview.");
  }
}

export async function listInterviewsForApi(input: {
  workspaceId: string;
  candidateId?: string;
  applicationId?: string;
  jobId?: string;
  interviewerId?: string;
  status?: Interview["status"];
  cursor: Cursor | null;
  limit: number;
}): Promise<Interview[]> {
  return db
    .select()
    .from(interviews)
    .where(
      and(
        eq(interviews.workspaceId, input.workspaceId),
        input.candidateId ? eq(interviews.candidateId, input.candidateId) : undefined,
        input.applicationId
          ? eq(interviews.applicationId, input.applicationId)
          : undefined,
        input.jobId ? eq(interviews.jobId, input.jobId) : undefined,
        input.interviewerId
          ? eq(interviews.interviewerId, input.interviewerId)
          : undefined,
        input.status ? eq(interviews.status, input.status) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(interviews.createdAt), desc(interviews.id))
    .limit(input.limit + 1);
}

export async function getInterviewForApi(input: {
  workspaceId: string;
  interviewId: string;
}): Promise<Interview> {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(
      and(
        eq(interviews.workspaceId, input.workspaceId),
        eq(interviews.id, input.interviewId),
      ),
    )
    .limit(1);
  if (!interview) throw ApiError.notFound("Interview not found.");
  return interview;
}

export async function createInterviewForApi(input: {
  workspaceId: string;
  actorUserId: string;
  values: InterviewApiInput;
}): Promise<Interview> {
  await Promise.all([
    assertWorkspaceMember(input.workspaceId, input.actorUserId),
    assertInterviewerMember(input.workspaceId, input.values.interviewerId),
  ]);
  assertFutureWhen(input.values.scheduledAt);

  const created = await db.transaction(async (tx) => {
    const [application] = await tx
      .select({ id: applications.id, jobId: applications.jobId })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, input.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, input.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.id, input.values.applicationId),
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.candidateId, input.values.candidateId),
        ),
      )
      .limit(1);
    if (!application) {
      throw ApiError.unprocessable(
        "Application must belong to the candidate in this workspace.",
      );
    }

    // Keep the read/check/write close together. DB has no exclusion constraint,
    // so callers needing strict concurrent booking protection must serialize.
    if (input.values.interviewerId) {
      const [conflict] = await tx
        .select({ id: interviews.id })
        .from(interviews)
        .where(
          and(
            eq(interviews.workspaceId, input.workspaceId),
            eq(interviews.interviewerId, input.values.interviewerId),
            eq(interviews.status, "scheduled"),
            sql`${interviews.scheduledAt} < ${new Date(input.values.scheduledAt.getTime() + input.values.durationMins * 60_000)}`,
            sql`${interviews.scheduledAt} + (${interviews.durationMins} * interval '1 minute') > ${input.values.scheduledAt}`,
          ),
        )
        .limit(1);
      if (conflict) {
        throw ApiError.conflict("This interviewer already has an overlapping interview.");
      }
    }

    const [interview] = await tx
      .insert(interviews)
      .values({
        workspaceId: input.workspaceId,
        applicationId: application.id,
        jobId: application.jobId,
        candidateId: input.values.candidateId,
        interviewerId: input.values.interviewerId ?? null,
        title: input.values.title ?? null,
        type: input.values.type,
        mode: input.values.mode,
        status: "scheduled",
        scheduledAt: input.values.scheduledAt,
        durationMins: input.values.durationMins,
        location: input.values.location ?? null,
        notes: input.values.notes ?? null,
        source: "api",
      })
      .returning();
    if (!interview) throw ApiError.internal("Interview could not be created.");

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application",
      entityId: application.id,
      type: "interview.scheduled",
      metadata: {
        interviewId: interview.id,
        scheduledAt: interview.scheduledAt.toISOString(),
        via: "api",
      },
    });
    return interview;
  });

  await emitWebhookEvent(input.workspaceId, "interview.scheduled", {
    interview: serializeInterview(created),
  });
  return created;
}

export async function updateInterviewForApi(input: {
  workspaceId: string;
  actorUserId: string;
  interviewId: string;
  values: InterviewApiUpdate;
}): Promise<Interview> {
  await assertWorkspaceMember(input.workspaceId, input.actorUserId);
  const current = await getInterviewForApi(input);
  if (current.status !== "scheduled") {
    throw ApiError.conflict("Only scheduled interviews can be updated.");
  }

  const interviewerId =
    input.values.interviewerId === undefined
      ? current.interviewerId
      : input.values.interviewerId;
  const scheduledAt = input.values.scheduledAt ?? current.scheduledAt;
  const durationMins = input.values.durationMins ?? current.durationMins;
  // Only validate futurity when the caller is moving the time; leaving the
  // existing time untouched (which may now be in the past if the interview was
  // sitting idle) should not block other edits.
  if (input.values.scheduledAt !== undefined) {
    assertFutureWhen(scheduledAt);
  }
  await assertInterviewerMember(input.workspaceId, interviewerId);
  await assertNoInterviewerConflict({
    workspaceId: input.workspaceId,
    interviewerId,
    scheduledAt,
    durationMins,
    excludeInterviewId: current.id,
  });

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.values.interviewerId !== undefined) set.interviewerId = interviewerId;
  if (input.values.title !== undefined) set.title = input.values.title;
  if (input.values.type !== undefined) set.type = input.values.type;
  if (input.values.mode !== undefined) set.mode = input.values.mode;
  if (input.values.scheduledAt !== undefined) set.scheduledAt = scheduledAt;
  if (input.values.durationMins !== undefined) set.durationMins = durationMins;
  if (input.values.location !== undefined) set.location = input.values.location;
  if (input.values.notes !== undefined) set.notes = input.values.notes;

  const [updated] = await db
    .update(interviews)
    .set(set)
    .where(
      and(
        eq(interviews.id, input.interviewId),
        eq(interviews.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!updated) throw ApiError.notFound("Interview not found.");

  await db.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorUserId,
    entityType: "application",
    entityId: updated.applicationId,
    type: "interview.updated",
    metadata: { interviewId: updated.id, via: "api" },
  });
  await emitWebhookEvent(input.workspaceId, "interview.rescheduled", {
    interview: serializeInterview(updated),
  });
  return updated;
}

export async function setInterviewStatusForApi(input: {
  workspaceId: string;
  actorUserId: string;
  interviewId: string;
  status: "completed" | "canceled";
}): Promise<Interview> {
  await assertWorkspaceMember(input.workspaceId, input.actorUserId);
  const current = await getInterviewForApi(input);
  if (current.status === input.status) return current;
  if (current.status !== "scheduled") {
    throw ApiError.conflict("Completed or canceled interviews cannot change status.");
  }

  const [updated] = await db
    .update(interviews)
    .set({ status: input.status, updatedAt: new Date() })
    .where(
      and(
        eq(interviews.id, input.interviewId),
        eq(interviews.workspaceId, input.workspaceId),
        eq(interviews.status, "scheduled"),
      ),
    )
    .returning();
  if (!updated) throw ApiError.conflict("Interview status changed; retry request.");

  const event = `interview.${input.status}` as const;
  await db.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorUserId,
    entityType: "application",
    entityId: updated.applicationId,
    type: event,
    metadata: { interviewId: updated.id, via: "api" },
  });
  await emitWebhookEvent(input.workspaceId, event, {
    interview: serializeInterview(updated),
  });
  return updated;
}
