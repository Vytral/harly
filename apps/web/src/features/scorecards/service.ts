import "server-only";

import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  applications,
  candidates,
  db,
  jobStages,
  member,
  scorecards,
  type Scorecard,
} from "@harly/db";

/** Workspace-scoped scorecard service for REST API. Never reads session state. */

export type ScorecardApiInput = {
  candidateId: string;
  applicationId?: string | null;
  stageId?: string | null;
  stageName?: string | null;
  rating: "strong" | "mixed" | "weak";
  comment?: string | null;
  criteria?: unknown[];
};

export function serializeScorecard(scorecard: Scorecard) {
  return {
    id: scorecard.id,
    candidateId: scorecard.candidateId,
    applicationId: scorecard.applicationId,
    stageId: scorecard.stageId,
    stageName: scorecard.stageName,
    authorId: scorecard.authorId,
    rating: scorecard.rating,
    comment: scorecard.comment,
    criteria: scorecard.criteria,
    createdAt: scorecard.createdAt.toISOString(),
    updatedAt: scorecard.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(scorecards.createdAt, createdAt),
    and(eq(scorecards.createdAt, createdAt), lt(scorecards.id, cursor.id)),
  );
}

export async function listScorecardsForApi(input: {
  workspaceId: string;
  candidateId?: string;
  applicationId?: string;
  cursor: Cursor | null;
  limit: number;
}): Promise<Scorecard[]> {
  return db
    .select()
    .from(scorecards)
    .where(
      and(
        eq(scorecards.workspaceId, input.workspaceId),
        input.candidateId
          ? eq(scorecards.candidateId, input.candidateId)
          : undefined,
        input.applicationId
          ? eq(scorecards.applicationId, input.applicationId)
          : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(scorecards.createdAt), desc(scorecards.id))
    .limit(input.limit + 1);
}

export async function createScorecardForApi(input: {
  workspaceId: string;
  actorUserId: string;
  values: ScorecardApiInput;
}): Promise<Scorecard> {
  const [actor] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!actor) throw ApiError.unprocessable("A workspace actor is required.");

  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        eq(candidates.id, input.values.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!candidate) throw ApiError.notFound("Candidate not found.");

  let application:
    | { id: string; candidateId: string; jobId: string }
    | undefined;
  if (input.values.applicationId) {
    const [row] = await db
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.values.applicationId),
        ),
      )
      .limit(1);
    if (!row) throw ApiError.notFound("Application not found.");
    if (row.candidateId !== candidate.id) {
      throw ApiError.unprocessable("Application does not belong to this candidate.");
    }
    application = row;
  }

  if ((input.values.stageId || input.values.stageName) && !application) {
    throw ApiError.unprocessable("A stage requires an application.");
  }

  let stage:
    | { id: string; name: string }
    | undefined;
  if (input.values.stageId) {
    const [row] = await db
      .select({ id: jobStages.id, name: jobStages.name })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, input.workspaceId),
          eq(jobStages.id, input.values.stageId),
          eq(jobStages.jobId, application!.jobId),
        ),
      )
      .limit(1);
    if (!row) {
      throw ApiError.unprocessable("Stage does not belong to the application job.");
    }
    stage = row;
  } else if (input.values.stageName) {
    const [row] = await db
      .select({ id: jobStages.id, name: jobStages.name })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, input.workspaceId),
          eq(jobStages.jobId, application!.jobId),
          eq(jobStages.name, input.values.stageName),
        ),
      )
      .limit(1);
    if (!row) {
      throw ApiError.unprocessable("Stage does not belong to the application job.");
    }
    stage = row;
  }

  if (
    stage &&
    input.values.stageName &&
    input.values.stageName !== stage.name
  ) {
    throw ApiError.unprocessable("Stage name does not match stage id.");
  }

  const [created] = await db
    .insert(scorecards)
    .values({
      workspaceId: input.workspaceId,
      candidateId: candidate.id,
      applicationId: application?.id ?? null,
      stageId: stage?.id ?? null,
      stageName: stage?.name ?? null,
      authorId: actor.userId,
      rating: input.values.rating,
      comment: input.values.comment?.trim() || null,
      criteria: input.values.criteria ?? [],
    })
    .returning();
  if (!created) throw ApiError.internal("Unable to create scorecard.");
  return created;
}
