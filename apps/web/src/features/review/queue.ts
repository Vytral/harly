import "server-only";

import { cache } from "react";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  candidates,
  db,
  effectiveStageKindSql,
  interviews,
  jobs,
  jobStages,
  scorecards,
  stageIsAnyKindSql,
} from "@harly/db";
import { candidateAvatarFallbackSrcs } from "@/lib/candidate-avatar";
import { daysSince } from "@/lib/date";
import { getWorkspaceGravatarEnabled } from "@/lib/gravatar";
import {
  actorHasPermission,
  jobScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";
import {
  indexMyScorecards,
  isPendingMyReview,
  needsScheduling,
  REVIEW_STAGE_KINDS,
  type ReviewStageKind,
} from "./rules";

/**
 * Review queue: the single source of truth for "what do I owe a review on".
 * Home counts, the greeting and the queue page must all read from here.
 *
 *   getReviewQueue(actor, { limit? }) -> { total, waitingOverWeek, items }
 *   getNeedsScheduling(actor, { limit? }) -> { total, items }
 *
 * `total` (and `waitingOverWeek`) always cover the whole result set; `limit`
 * only trims `items`. Items are ordered longest-waiting first, with the
 * application id as a stable tie-break, so a caller walking the queue
 * (previous / next) gets a deterministic order. The predicate lives in
 * `./rules` (documented there) and is scoped to the actor's job scope and
 * `candidates:view`; an actor without that permission gets an empty result.
 */

const WAITING_OVER_WEEK_DAYS = 7;

export type ReviewQueueItem = {
  /** Application id: the unit the queue walks, one entry per application. */
  applicationId: string;
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  avatarFallbackSrcs: string[];
  job: string;
  stage: string;
  stageKind: ReviewStageKind;
  /** Stable code for the work owed; the UI resolves its label. */
  action: "interviewFeedback" | "resumeReview";
  /** Days since the application entered its current stage. */
  ageDays: number;
};

export type SchedulingItem = {
  applicationId: string;
  candidateId: string;
  name: string;
  job: string;
  stage: string;
  ageDays: number;
};

type Options = { limit?: number };

/** Active applications in review-type stages within the actor's scope. */
const loadReviewStageRows = cache(async (actor: WorkspaceSearchActor) => {
  const [rows, mine, gravatarEnabled] = await Promise.all([
    db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        first: candidates.firstName,
        last: candidates.lastName,
        email: candidates.email,
        avatarUrl: candidates.avatarUrl,
        githubUrl: candidates.githubUrl,
        jobTitle: jobs.title,
        stageId: jobStages.id,
        stageName: jobStages.name,
        stageKind: effectiveStageKindSql(jobStages),
        appliedAt: applications.appliedAt,
        enteredAt: sql<string | null>`(select max(${applicationStageHistory.createdAt}) from ${applicationStageHistory} where ${applicationStageHistory.applicationId} = ${applications.id} and ${applicationStageHistory.workspaceId} = ${actor.workspaceId})`,
        hasInterview: sql<boolean>`exists (select 1 from ${interviews} where ${interviews.applicationId} = ${applications.id} and ${interviews.workspaceId} = ${actor.workspaceId} and ${interviews.status} <> 'canceled')`,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.workspaceId, actor.workspaceId),
          eq(candidates.id, applications.candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.workspaceId, actor.workspaceId),
          eq(jobs.id, applications.jobId),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.workspaceId, actor.workspaceId),
          eq(jobStages.id, applications.currentStageId),
          stageIsAnyKindSql(jobStages, REVIEW_STAGE_KINDS),
          isNull(jobStages.archivedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, actor.workspaceId),
          eq(applications.status, "active"),
          jobScopeSql(actor),
        ),
      ),
    db
      .select({
        applicationId: scorecards.applicationId,
        stageId: scorecards.stageId,
        stageName: scorecards.stageName,
      })
      .from(scorecards)
      .where(
        and(
          eq(scorecards.workspaceId, actor.workspaceId),
          eq(scorecards.authorId, actor.userId),
        ),
      ),
    getWorkspaceGravatarEnabled(actor.workspaceId),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      // The where clause admits only these two kinds.
      kind: r.stageKind as ReviewStageKind,
      name: `${r.first} ${r.last}`,
      ageDays: daysSince(r.enteredAt ?? r.appliedAt),
    })),
    mine: indexMyScorecards(mine),
    gravatarEnabled,
  };
});

const oldestFirst = (
  a: { ageDays: number; applicationId: string },
  b: { ageDays: number; applicationId: string },
) => b.ageDays - a.ageDays || a.applicationId.localeCompare(b.applicationId);

export async function getReviewQueue(
  actor: WorkspaceSearchActor,
  { limit }: Options = {},
): Promise<{ total: number; waitingOverWeek: number; items: ReviewQueueItem[] }> {
  if (!actorHasPermission(actor, "candidates:view")) {
    return { total: 0, waitingOverWeek: 0, items: [] };
  }
  const { rows, mine, gravatarEnabled } = await loadReviewStageRows(actor);

  const pending = rows
    .filter((r) =>
      isPendingMyReview(
        {
          applicationId: r.applicationId,
          stageId: r.stageId,
          stageName: r.stageName,
          kind: r.kind,
          hasInterview: r.hasInterview,
        },
        mine,
      ),
    )
    .sort(oldestFirst);

  const items: ReviewQueueItem[] = pending.slice(0, limit).map((r) => ({
    applicationId: r.applicationId,
    candidateId: r.candidateId,
    name: r.name,
    avatarUrl: r.avatarUrl,
    avatarFallbackSrcs: candidateAvatarFallbackSrcs(r.email, r.githubUrl, { gravatarEnabled }),
    job: r.jobTitle,
    stage: r.stageName,
    stageKind: r.kind,
    action: r.kind === "interview" ? "interviewFeedback" : "resumeReview",
    ageDays: r.ageDays,
  }));

  return {
    total: pending.length,
    waitingOverWeek: pending.filter((r) => r.ageDays > WAITING_OVER_WEEK_DAYS).length,
    items,
  };
}

/** Interview-stage applications that have no interview scheduled yet. */
export async function getNeedsScheduling(
  actor: WorkspaceSearchActor,
  { limit }: Options = {},
): Promise<{ total: number; items: SchedulingItem[] }> {
  if (!actorHasPermission(actor, "candidates:view")) return { total: 0, items: [] };
  const { rows } = await loadReviewStageRows(actor);

  const waiting = rows
    .filter((r) =>
      needsScheduling({
        applicationId: r.applicationId,
        stageId: r.stageId,
        stageName: r.stageName,
        kind: r.kind,
        hasInterview: r.hasInterview,
      }),
    )
    .sort(oldestFirst);

  return {
    total: waiting.length,
    items: waiting.slice(0, limit).map((r) => ({
      applicationId: r.applicationId,
      candidateId: r.candidateId,
      name: r.name,
      job: r.jobTitle,
      stage: r.stageName,
      ageDays: r.ageDays,
    })),
  };
}
