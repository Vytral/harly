import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  aiEvaluations,
  applicationStageHistory,
  applications,
  candidateReferrals,
  candidateTags,
  candidates,
  consentRecords,
  db,
  effectiveStageKind,
  jobStages,
  jobs,
  scorecards,
  user,
} from "@harly/db";

import { candidateScopeSql, jobScopeSql, type WorkspaceSearchActor } from "@/features/search/scope";

// Read queries that have no equivalent in the dashboard data layer. They apply
// the same role scope (jobScopeSql / candidateScopeSql) the dashboard does.

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export type ApplicationSearchFilters = {
  jobId?: string;
  stageId?: string;
  status?: "active" | "hired" | "rejected" | "withdrawn";
  source?: string;
  query?: string;
  minScore?: number;
  maxScore?: number;
  recommendation?: "strong_yes" | "yes" | "maybe" | "no";
  appliedAfter?: Date;
  appliedBefore?: Date;
  sort: "recent" | "oldest" | "score";
  limit: number;
  offset: number;
};

export async function searchApplications(actor: WorkspaceSearchActor, filters: ApplicationSearchFilters) {
  const conditions: SQL[] = [
    eq(applications.workspaceId, actor.workspaceId),
    isNull(candidates.deletedAt),
    isNull(candidates.anonymizedAt),
  ];
  const scope = jobScopeSql(actor);
  if (scope) conditions.push(scope);
  if (filters.jobId) conditions.push(eq(applications.jobId, filters.jobId));
  if (filters.stageId) conditions.push(eq(applications.currentStageId, filters.stageId));
  if (filters.status) conditions.push(eq(applications.status, filters.status));
  if (filters.source) conditions.push(eq(applications.source, filters.source));
  if (filters.minScore !== undefined) conditions.push(gte(aiEvaluations.score, filters.minScore));
  if (filters.maxScore !== undefined) conditions.push(lte(aiEvaluations.score, filters.maxScore));
  if (filters.recommendation) conditions.push(eq(aiEvaluations.recommendation, filters.recommendation));
  if (filters.appliedAfter) conditions.push(gte(applications.appliedAt, filters.appliedAfter));
  if (filters.appliedBefore) conditions.push(lte(applications.appliedAt, filters.appliedBefore));
  if (filters.query) {
    const pattern = likePattern(filters.query);
    conditions.push(
      or(
        ilike(sql`${candidates.firstName} || ' ' || ${candidates.lastName}`, pattern),
        ilike(candidates.email, pattern),
        ilike(candidates.headline, pattern),
        ilike(jobs.title, pattern),
      )!,
    );
  }
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(applications)
    .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), eq(candidates.workspaceId, actor.workspaceId)))
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, actor.workspaceId), isNull(jobs.deletedAt)))
    .leftJoin(aiEvaluations, eq(aiEvaluations.applicationId, applications.id))
    .where(where);

  const orderBy =
    filters.sort === "score"
      ? [sql`${aiEvaluations.score} desc nulls last`, desc(applications.appliedAt), desc(applications.id)]
      : filters.sort === "oldest"
        ? [asc(applications.appliedAt), asc(applications.id)]
        : [desc(applications.appliedAt), desc(applications.id)];

  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      jobId: jobs.id,
      jobTitle: jobs.title,
      stageId: jobStages.id,
      stageName: jobStages.name,
      stageKind: jobStages.kind,
      status: applications.status,
      source: applications.source,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
      score: aiEvaluations.score,
      recommendation: aiEvaluations.recommendation,
      evaluationSource: aiEvaluations.source,
    })
    .from(applications)
    .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), eq(candidates.workspaceId, actor.workspaceId)))
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, actor.workspaceId), isNull(jobs.deletedAt)))
    .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .leftJoin(aiEvaluations, eq(aiEvaluations.applicationId, applications.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(filters.limit)
    .offset(filters.offset);

  return {
    total: Number(totalRow?.total ?? 0),
    rows: rows.map((row) => ({
      ...row,
      stageKind: effectiveStageKind({ kind: row.stageKind, name: row.stageName }),
    })),
  };
}

/** Active stages of one job with how many applications sit in each. */
export async function stagesWithCounts(workspaceId: string, jobId: string) {
  const stages = await db
    .select({
      id: jobStages.id,
      name: jobStages.name,
      kind: jobStages.kind,
      order: jobStages.order,
      color: jobStages.color,
      emailConfig: jobStages.emailConfig,
    })
    .from(jobStages)
    .where(and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, jobId), isNull(jobStages.archivedAt)))
    .orderBy(asc(jobStages.order));
  const counts = await db
    .select({ stageId: applications.currentStageId, status: applications.status, total: count() })
    .from(applications)
    .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), isNull(candidates.deletedAt)))
    .where(and(eq(applications.workspaceId, workspaceId), eq(applications.jobId, jobId)))
    .groupBy(applications.currentStageId, applications.status);
  return stages.map((stage) => {
    const mine = counts.filter((row) => row.stageId === stage.id);
    return {
      id: stage.id,
      name: stage.name,
      kind: effectiveStageKind({ kind: stage.kind, name: stage.name }),
      order: stage.order,
      color: stage.color,
      candidateUpdateEmailsEnabled:
        (stage.emailConfig as { candidateUpdatesEnabled?: boolean } | null)?.candidateUpdatesEnabled !== false,
      activeApplications: mine.filter((row) => row.status === "active").reduce((sum, row) => sum + Number(row.total), 0),
      totalApplications: mine.reduce((sum, row) => sum + Number(row.total), 0),
    };
  });
}

/** Active stages (id + name) of the job an application belongs to. */
export async function activeStagesForApplication(workspaceId: string, applicationId: string) {
  const [application] = await db
    .select({ jobId: applications.jobId, currentStageId: applications.currentStageId, status: applications.status })
    .from(applications)
    .where(and(eq(applications.workspaceId, workspaceId), eq(applications.id, applicationId)))
    .limit(1);
  if (!application) return null;
  const stages = await db
    .select({ id: jobStages.id, name: jobStages.name, kind: jobStages.kind, order: jobStages.order })
    .from(jobStages)
    .where(and(eq(jobStages.workspaceId, workspaceId), eq(jobStages.jobId, application.jobId), isNull(jobStages.archivedAt)))
    .orderBy(asc(jobStages.order));
  return { ...application, stages };
}

export async function stageHistoryForApplication(workspaceId: string, applicationId: string, limit = 50) {
  const fromStage = alias(jobStages, "from_stage");
  const toStage = alias(jobStages, "to_stage");
  const rows = await db
    .select({
      at: applicationStageHistory.createdAt,
      fromStage: fromStage.name,
      toStage: toStage.name,
      movedBy: user.name,
    })
    .from(applicationStageHistory)
    .leftJoin(fromStage, eq(fromStage.id, applicationStageHistory.fromStageId))
    .innerJoin(toStage, eq(toStage.id, applicationStageHistory.toStageId))
    .leftJoin(user, eq(user.id, applicationStageHistory.movedById))
    .where(
      and(
        eq(applicationStageHistory.workspaceId, workspaceId),
        eq(applicationStageHistory.applicationId, applicationId),
      ),
    )
    .orderBy(desc(applicationStageHistory.createdAt))
    .limit(limit);
  return rows;
}

export async function consentRecordsForCandidate(workspaceId: string, candidateId: string) {
  return db
    .select({
      consentType: consentRecords.consentType,
      granted: consentRecords.granted,
      withdrawnAt: consentRecords.withdrawnAt,
      createdAt: consentRecords.createdAt,
    })
    .from(consentRecords)
    .where(and(eq(consentRecords.workspaceId, workspaceId), eq(consentRecords.candidateId, candidateId)))
    .orderBy(desc(consentRecords.createdAt));
}

/** Ids among `candidateIds` whose personal data was anonymized by the retention policy. */
export async function anonymizedCandidateIds(workspaceId: string, candidateIds: readonly string[]) {
  if (candidateIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: candidates.id, anonymizedAt: candidates.anonymizedAt })
    .from(candidates)
    .where(and(eq(candidates.workspaceId, workspaceId), inArray(candidates.id, [...candidateIds])));
  return new Set(rows.filter((row) => row.anonymizedAt !== null).map((row) => row.id));
}

/** Referrals visible to the actor, newest first, optionally for one candidate or job. */
export async function listReferrals(
  actor: WorkspaceSearchActor,
  filters: { candidateId?: string; jobId?: string; featuredOnly?: boolean; limit: number; offset: number },
) {
  const referredBy = alias(user, "referred_by");
  const conditions: SQL[] = [
    eq(candidateReferrals.workspaceId, actor.workspaceId),
    isNull(candidates.deletedAt),
    isNull(candidates.anonymizedAt),
  ];
  const candidateScope = candidateScopeSql(actor, candidates.id);
  if (candidateScope) conditions.push(candidateScope);
  // A referral that names a job outside the actor's scope is hidden.
  const jobScope = jobScopeSql(actor);
  if (jobScope) conditions.push(or(isNull(candidateReferrals.jobId), jobScope)!);
  if (filters.candidateId) conditions.push(eq(candidateReferrals.candidateId, filters.candidateId));
  if (filters.jobId) conditions.push(eq(candidateReferrals.jobId, filters.jobId));
  if (filters.featuredOnly) conditions.push(eq(candidateReferrals.featured, true));
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(candidateReferrals)
    .innerJoin(candidates, eq(candidates.id, candidateReferrals.candidateId))
    .leftJoin(jobs, eq(jobs.id, candidateReferrals.jobId))
    .where(where);

  const rows = await db
    .select({
      id: candidateReferrals.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobId: candidateReferrals.jobId,
      jobTitle: jobs.title,
      referredById: candidateReferrals.referredById,
      referredByName: referredBy.name,
      featured: candidateReferrals.featured,
      note: candidateReferrals.note,
      createdAt: candidateReferrals.createdAt,
    })
    .from(candidateReferrals)
    .innerJoin(candidates, eq(candidates.id, candidateReferrals.candidateId))
    .leftJoin(jobs, eq(jobs.id, candidateReferrals.jobId))
    .innerJoin(referredBy, eq(referredBy.id, candidateReferrals.referredById))
    .where(where)
    .orderBy(desc(candidateReferrals.featured), desc(candidateReferrals.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return { total: Number(totalRow?.total ?? 0), rows };
}

export async function tagsForCandidate(workspaceId: string, candidateId: string) {
  return db
    .select({ id: candidateTags.id, label: candidateTags.label })
    .from(candidateTags)
    .where(and(eq(candidateTags.workspaceId, workspaceId), eq(candidateTags.candidateId, candidateId)))
    .orderBy(asc(candidateTags.label));
}

/** Side-by-side facts for 2..5 applications. Callers pass only applications the actor may see. */
export async function compareApplications(workspaceId: string, applicationIds: readonly string[]) {
  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      headline: candidates.headline,
      skills: candidates.skills,
      experienceYears: candidates.experienceYears,
      jobId: jobs.id,
      jobTitle: jobs.title,
      stageName: jobStages.name,
      status: applications.status,
      source: applications.source,
      appliedAt: applications.appliedAt,
      score: aiEvaluations.score,
      recommendation: aiEvaluations.recommendation,
      confidence: aiEvaluations.confidence,
      requiresHumanReview: aiEvaluations.requiresHumanReview,
      summary: aiEvaluations.summary,
      strengths: aiEvaluations.strengths,
      gaps: aiEvaluations.gaps,
    })
    .from(applications)
    .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), isNull(candidates.deletedAt), isNull(candidates.anonymizedAt)))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .leftJoin(aiEvaluations, eq(aiEvaluations.applicationId, applications.id))
    .where(and(eq(applications.workspaceId, workspaceId), inArray(applications.id, [...applicationIds])));

  const ratings = await db
    .select({ applicationId: scorecards.applicationId, rating: scorecards.rating, total: count() })
    .from(scorecards)
    .where(and(eq(scorecards.workspaceId, workspaceId), inArray(scorecards.applicationId, [...applicationIds])))
    .groupBy(scorecards.applicationId, scorecards.rating);

  return { rows, ratings };
}
