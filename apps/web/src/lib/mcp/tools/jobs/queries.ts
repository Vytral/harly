import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  candidates,
  db,
  jobApprovalRequests,
  jobStages,
  jobs,
  user,
  workspaceSettings,
} from "@harly/db";

import { jobScopeSql } from "@/features/search/scope";
import { resolveSearchActor } from "@/features/search/workspace-search";
import type { JobListRow } from "./helpers";

// Read queries that exist only for the MCP surface (filtering, pagination,
// per-stage aging). They reuse the dashboard's role-scope predicate so a
// restricted role sees exactly the jobs the web app shows it.

export type JobListFilters = {
  status?: "draft" | "open" | "closed";
  department?: string;
  location?: string;
  search?: string;
  trashed?: boolean;
  limit: number;
  offset: number;
};

function likePattern(value: string): string {
  return `%${value.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listJobsPage(filters: JobListFilters): Promise<{ rows: JobListRow[]; total: number }> {
  const actor = await resolveSearchActor();
  const search = filters.search?.trim();
  const where = and(
    eq(jobs.workspaceId, actor.workspaceId),
    filters.trashed ? isNotNull(jobs.deletedAt) : isNull(jobs.deletedAt),
    jobScopeSql(actor),
    filters.status ? eq(jobs.status, filters.status) : undefined,
    filters.department?.trim()
      ? sql`lower(${jobs.department}) = ${filters.department.trim().toLowerCase()}`
      : undefined,
    filters.location?.trim() ? sql`${jobs.location} ilike ${likePattern(filters.location)}` : undefined,
    search
      ? or(
          sql`${jobs.title} ilike ${likePattern(search)}`,
          sql`${jobs.slug} ilike ${likePattern(search)}`,
          sql`${jobs.department} ilike ${likePattern(search)}`,
          sql`${jobs.location} ilike ${likePattern(search)}`,
          sql`${jobs.sector} ilike ${likePattern(search)}`,
        )
      : undefined,
  );
  // ISO string: the raw sql template cannot parametrise a Date here.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        slug: jobs.slug,
        department: jobs.department,
        location: jobs.location,
        employmentType: jobs.employmentType,
        workplaceType: jobs.workplaceType,
        status: jobs.status,
        publishedAt: jobs.publishedAt,
        createdAt: jobs.createdAt,
        deletedAt: jobs.deletedAt,
        applicants: sql<number>`count(${applications.id})::int`,
        activeApplicants: sql<number>`count(*) filter (where ${applications.status} = 'active')::int`,
        newApplicants: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${weekAgo}::timestamptz)::int`,
        lastAppliedAt: sql<Date | null>`max(${applications.appliedAt})`,
      })
      .from(jobs)
      .leftJoin(
        applications,
        and(eq(applications.workspaceId, actor.workspaceId), eq(applications.jobId, jobs.id)),
      )
      .where(where)
      .groupBy(jobs.id)
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(filters.limit)
      .offset(filters.offset),
    db.select({ total: count() }).from(jobs).where(where),
  ]);

  return { rows: rows as JobListRow[], total: Number(totalRow?.total ?? 0) };
}

export type StageCount = { stageId: string; name: string; order: number; count: number };

/** Active applications per active stage, for each of the given jobs. */
export async function activeCountsByStage(jobIds: string[]): Promise<Map<string, StageCount[]>> {
  const result = new Map<string, StageCount[]>();
  if (jobIds.length === 0) return result;
  const actor = await resolveSearchActor();
  const rows = await db
    .select({
      jobId: jobStages.jobId,
      stageId: jobStages.id,
      name: jobStages.name,
      order: jobStages.order,
      count: sql<number>`count(${applications.id})::int`,
    })
    .from(jobStages)
    .leftJoin(
      applications,
      and(
        eq(applications.currentStageId, jobStages.id),
        eq(applications.status, "active"),
        eq(applications.workspaceId, actor.workspaceId),
      ),
    )
    .where(
      and(
        eq(jobStages.workspaceId, actor.workspaceId),
        inArray(jobStages.jobId, jobIds),
        isNull(jobStages.archivedAt),
      ),
    )
    .groupBy(jobStages.id)
    .orderBy(asc(jobStages.order));
  for (const row of rows) {
    const list = result.get(row.jobId) ?? [];
    list.push({ stageId: row.stageId, name: row.name, order: row.order, count: Number(row.count) });
    result.set(row.jobId, list);
  }
  return result;
}

export type StageAging = {
  stageId: string;
  active: number;
  avgDaysInStage: number;
  maxDaysInStage: number;
  stalled: number;
};

/**
 * Time active applications have sat in their current stage. Entry time is the
 * latest move into the stage, or the application date when it never moved.
 */
export async function stageAgingForJob(jobId: string, staleDays: number): Promise<StageAging[]> {
  const actor = await resolveSearchActor();
  const enteredAt = sql`coalesce((select max(${applicationStageHistory.createdAt}) from ${applicationStageHistory} where ${applicationStageHistory.applicationId} = ${applications.id} and ${applicationStageHistory.toStageId} = ${applications.currentStageId}), ${applications.appliedAt})`;
  const ageDays = sql`(extract(epoch from (now() - ${enteredAt})) / 86400)`;
  const rows = await db
    .select({
      stageId: applications.currentStageId,
      active: sql<number>`count(*)::int`,
      avgDays: sql<number>`coalesce(avg(${ageDays}), 0)::float`,
      maxDays: sql<number>`coalesce(max(${ageDays}), 0)::float`,
      stalled: sql<number>`count(*) filter (where ${ageDays} >= ${staleDays}::float)::int`,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(
      and(
        eq(applications.workspaceId, actor.workspaceId),
        eq(applications.jobId, jobId),
        eq(applications.status, "active"),
        isNull(candidates.deletedAt),
      ),
    )
    .groupBy(applications.currentStageId);
  return rows.map((row) => ({
    stageId: row.stageId,
    active: Number(row.active),
    avgDaysInStage: Math.round(Number(row.avgDays) * 10) / 10,
    maxDaysInStage: Math.round(Number(row.maxDays) * 10) / 10,
    stalled: Number(row.stalled),
  }));
}

export type ApplicationActivity = {
  byStatus: Record<string, number>;
  lastAppliedAt: Date | null;
  newThisWeek: number;
};

export async function applicationActivity(jobId: string): Promise<ApplicationActivity> {
  const actor = await resolveSearchActor();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await db
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`,
      lastAppliedAt: sql<Date | null>`max(${applications.appliedAt})`,
      newThisWeek: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${weekAgo}::timestamptz)::int`,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(
      and(
        eq(applications.workspaceId, actor.workspaceId),
        eq(applications.jobId, jobId),
        isNull(candidates.deletedAt),
      ),
    )
    .groupBy(applications.status);
  let last: Date | null = null;
  for (const row of rows) {
    if (row.lastAppliedAt) {
      const at = new Date(row.lastAppliedAt);
      if (!last || at > last) last = at;
    }
  }
  return {
    byStatus: Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])),
    lastAppliedAt: last,
    newThisWeek: rows.reduce((sum, row) => sum + Number(row.newThisWeek), 0),
  };
}

export type ApprovalRow = {
  requestId: string;
  jobId: string;
  jobTitle: string;
  requesterId: string;
  requesterName: string | null;
  approverId: string;
  status: string;
  comment: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

/** Pending approval requests assigned to the caller, limited to jobs in their scope. */
export async function listPendingApprovalsForMe(): Promise<ApprovalRow[]> {
  const actor = await resolveSearchActor();
  return db
    .select({
      requestId: jobApprovalRequests.id,
      jobId: jobs.id,
      jobTitle: jobs.title,
      requesterId: jobApprovalRequests.requesterId,
      requesterName: user.name,
      approverId: jobApprovalRequests.approverId,
      status: jobApprovalRequests.status,
      comment: jobApprovalRequests.comment,
      createdAt: jobApprovalRequests.createdAt,
      decidedAt: jobApprovalRequests.decidedAt,
    })
    .from(jobApprovalRequests)
    .innerJoin(jobs, eq(jobs.id, jobApprovalRequests.jobId))
    .leftJoin(user, eq(user.id, jobApprovalRequests.requesterId))
    .where(
      and(
        eq(jobApprovalRequests.workspaceId, actor.workspaceId),
        eq(jobApprovalRequests.approverId, actor.userId),
        eq(jobApprovalRequests.status, "pending"),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
      ),
    )
    .orderBy(asc(jobApprovalRequests.createdAt));
}

export async function getCareerPageSettings(workspaceId: string) {
  const [row] = await db
    .select({ config: workspaceSettings.careerPageConfig })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.config ?? null;
}
