import "server-only";

import { cache } from "react";
import { and, asc, count, desc, eq, exists, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  effectiveStageKind,
  interviews,
  jobs,
  jobStages,
  tasks,
  user,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  getDailySeries,
  getHiresByJob,
  getHiringKpis,
  getWorkspaceTimeZone,
} from "@/features/reports/canonical";
import {
  allTimeWindow,
  dayLabel,
  localDateKey,
  previousWindow,
  resolveWindow,
} from "@/features/reports/window";
import {
  actorHasPermission,
  isUnrestrictedScope,
  jobScopeSql,
  taskScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";
import { resolveSearchActor } from "@/features/search/workspace-search";
import { getNeedsScheduling, getReviewQueue } from "@/features/review/queue";
import type { Permission } from "@/features/workspaces/permissions";
import { taskDueState } from "@/features/tasks/shared";
import { daysSince } from "@/lib/date";

const DAY_MS = 86_400_000;
const PERF_DAYS = 14;
const RISK_WINDOW_DAYS = 30;

/**
 * The caller's permissions and role scope, resolved once per request. Every
 * widget gates on this: a widget the caller cannot see returns nothing (or is
 * omitted by the page) instead of raising an error.
 */
const widgetActor = cache(() => resolveSearchActor());

function hasAnyPermission(actor: WorkspaceSearchActor, permissions: readonly Permission[]) {
  return permissions.some((permission) => actorHasPermission(actor, permission));
}

/**
 * Which home widgets the caller may see. The page renders a widget only when
 * its flag is set, so the data for an omitted widget is never requested.
 */
export type DashboardWidgetAccess = {
  reviewCandidates: boolean;
  todayInterviews: boolean;
  /** Interview-stage candidates that still need an interview booked. */
  scheduling: boolean;
  pipeline: boolean;
  /** Job descriptions awaiting this actor's approval. */
  approvals: boolean;
  tasks: boolean;
  /** Canonical hiring metrics are workspace-wide, so only unrestricted actors see them. */
  performance: boolean;
};

export const getDashboardWidgetAccess = cache(async (): Promise<DashboardWidgetAccess> => {
  const actor = await widgetActor();
  const has = (permission: Permission) => actorHasPermission(actor, permission);
  return {
    reviewCandidates: has("candidates:view"),
    todayInterviews: hasAnyPermission(actor, ["interviews:manage", "interviews:feedback"]),
    scheduling: has("candidates:view") && has("interviews:manage"),
    pipeline: has("candidates:view"),
    approvals: has("jobs:approve"),
    tasks: has("tasks:read"),
    performance: has("reports:read") && isUnrestrictedScope(actor.scope),
  };
});

function interviewTypeLabel(type: string): string {
  switch (type) {
    case "culture_fit":
      return "Culture fit interview";
    case "technical":
      return "Technical interview";
    case "onsite":
      return "Onsite interview";
    case "final":
      return "Final interview";
    default:
      return "Screening call";
  }
}

// ── Pipeline overview (one job, counts per stage) ──────────────────────────

export const getPipelineOverview = cache(async (jobId?: string) => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "candidates:view")) {
    return { jobs: [], selected: null, stages: [], total: 0 };
  }

  const openJobs = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
      ),
    )
    .orderBy(asc(jobs.title));

  if (openJobs.length === 0) {
    return { jobs: [], selected: null, stages: [], total: 0 };
  }

  let selectedId =
    jobId && openJobs.some((j) => j.id === jobId) ? jobId : null;

  if (!selectedId) {
    // Default to the job with the most active candidates in flight.
    const [busiest] = await db
      .select({ jobId: applications.jobId, value: count() })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspace.id),
          eq(applications.status, "active"),
          inArray(applications.jobId, openJobs.map((job) => job.id)),
          exists(
            db
              .select({ id: candidates.id })
              .from(candidates)
              .where(
                and(
                  eq(candidates.id, applications.candidateId),
                  eq(candidates.workspaceId, workspace.id),
                  isNull(candidates.deletedAt),
                ),
              ),
          ),
        ),
      )
      .groupBy(applications.jobId)
      .orderBy(desc(count()))
      .limit(1);
    selectedId = busiest?.jobId ?? openJobs[0].id;
  }

  const selected = openJobs.find((j) => j.id === selectedId) ?? openJobs[0];

  const stageRows = await db
    .select({
      name: jobStages.name,
      kind: jobStages.kind,
      color: jobStages.color,
      order: jobStages.order,
      value: count(applications.id),
    })
    .from(jobStages)
    .leftJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.currentStageId, jobStages.id),
        eq(applications.status, "active"),
        exists(
          db
            .select({ id: candidates.id })
            .from(candidates)
            .where(
              and(
                eq(candidates.id, applications.candidateId),
                eq(candidates.workspaceId, workspace.id),
                isNull(candidates.deletedAt),
              ),
            ),
        ),
      ),
    )
    .where(
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.jobId, selected.id),
        isNull(jobStages.archivedAt),
      ),
    )
    .groupBy(jobStages.id)
    .orderBy(asc(jobStages.order));

  // The funnel view omits the terminal rejected lane. Decided by stage kind,
  // so a renamed rejected stage is hidden and a custom stage named "Rejected"
  // stays visible.
  const stages = stageRows
    .filter(
      (s) => effectiveStageKind({ kind: s.kind, name: s.name }) !== "rejected",
    )
    .map((s) => ({
      name: s.name,
      color: s.color,
      count: Number(s.value),
      order: s.order,
    }));

  return {
    jobs: openJobs,
    selected: { id: selected.id, title: selected.title },
    stages,
    total: stages.reduce((n, s) => n + s.count, 0),
  };
});

// ── Today's interviews ──────────────────────────────────────────────────────

const TODAY_INTERVIEWS_SHOWN = 8;

/**
 * Interviews on the workspace's local day. `total` counts every interview of
 * the day (the calendar lists the same set); `items` is the first few. `date`
 * is that local day as `YYYY-MM-DD`, ready for `/dashboard/calendars?date=`.
 */
export const getTodayInterviews = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!hasAnyPermission(actor, ["interviews:manage", "interviews:feedback"])) {
    return { total: 0, items: [], date: null };
  }
  // "Today" is the workspace's local day, not the server's.
  const timeZone = await getWorkspaceTimeZone(workspace.id);
  const now = new Date();
  const today = resolveWindow(1, timeZone, now);
  const start = today.from;
  const end = today.to;

  const rows = await db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      type: interviews.type,
      title: interviews.title,
      candidateId: candidates.id,
      first: candidates.firstName,
      last: candidates.lastName,
      jobTitle: jobs.title,
      interviewer: user.name,
      interviewerImage: user.image,
      gcalEventId: interviews.gcalEventId,
    })
    .from(interviews)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, interviews.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.id, interviews.jobId),
        isNull(jobs.deletedAt),
      ),
    )
    .leftJoin(user, eq(user.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, workspace.id),
        gte(interviews.scheduledAt, start),
        lt(interviews.scheduledAt, end),
        jobScopeSql(actor),
      ),
    )
    .orderBy(asc(interviews.scheduledAt));

  return {
    total: rows.length,
    date: localDateKey(now, timeZone),
    items: rows.slice(0, TODAY_INTERVIEWS_SHOWN).map((r) => ({
      id: r.id,
      scheduledAt: r.scheduledAt,
      type: r.type,
      label: r.title ?? interviewTypeLabel(r.type),
      hasCustomTitle: r.title !== null,
      candidateId: r.candidateId,
      candidate: `${r.first} ${r.last}`,
      job: r.jobTitle,
      interviewer: r.interviewer ?? null,
      interviewerImage: r.interviewerImage ?? null,
      inGoogleCalendar: r.gcalEventId !== null,
    })),
  };
});

// ── Candidates needing review (with aging) ──────────────────────────────────

const REVIEW_SHOWN = 5;
const SCHEDULING_SHOWN = 4;

/**
 * MY pending reviews (see `@/features/review/queue`): `total` is the real
 * count, the same one the review queue page lists; `items` is the oldest few.
 */
export const getCandidatesNeedingReview = cache(async () =>
  getReviewQueue(await widgetActor(), { limit: REVIEW_SHOWN }),
);

/** Interview-stage candidates with no interview scheduled yet. */
export const getInterviewsToSchedule = cache(async () =>
  getNeedsScheduling(await widgetActor(), { limit: SCHEDULING_SHOWN }),
);

// ── Jobs at risk ─────────────────────────────────────────────────────────────

export const getJobsAtRisk = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "reports:read")) return [];
  const timeZone = await getWorkspaceTimeZone(workspace.id);
  const now = new Date();
  const recentWindow = resolveWindow(RISK_WINDOW_DAYS, timeZone, now);

  const [rows, recentHires, allTimeHires] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        publishedAt: jobs.publishedAt,
        createdAt: jobs.createdAt,
        total: count(applications.id),
        lastAppliedAt: sql<string | null>`max(${applications.appliedAt})`,
      })
      .from(jobs)
      .leftJoin(
        applications,
        and(
          eq(applications.workspaceId, workspace.id),
          eq(applications.jobId, jobs.id),
          exists(
            db
              .select({ id: candidates.id })
              .from(candidates)
              .where(
                and(
                  eq(candidates.id, applications.candidateId),
                  eq(candidates.workspaceId, workspace.id),
                  isNull(candidates.deletedAt),
                ),
              ),
          ),
        ),
      )
      .where(
        and(
          eq(jobs.workspaceId, workspace.id),
          eq(jobs.status, "open"),
          isNull(jobs.deletedAt),
          jobScopeSql(actor),
        ),
      )
      .groupBy(jobs.id)
      .orderBy(asc(jobs.createdAt)),
    getHiresByJob({ workspaceId: workspace.id, window: recentWindow }),
    getHiresByJob({ workspaceId: workspace.id, window: allTimeWindow(timeZone) }),
  ]);

  return rows
    .map((r) => {
      const total = Number(r.total);
      const hiresLast30 = recentHires.get(r.id) ?? 0;
      const hiresEver = allTimeHires.get(r.id) ?? 0;
      // Age is measured from publish. Jobs that were never published fall back
      // to creation so the signal still exists for them.
      const publishedAt = r.publishedAt ?? r.createdAt;
      const ageDays = (now.getTime() - new Date(publishedAt).getTime()) / DAY_MS;
      const lastAppDays = r.lastAppliedAt
        ? (now.getTime() - new Date(r.lastAppliedAt).getTime()) / DAY_MS
        : Infinity;

      let reason: string | null = null;
      let reasonCode: "noApplications" | "noApplicationsWeek" | "noHires" | "lowConversion" | null = null;
      let severity: "critical" | "danger" | "warning" = "danger";
      if (lastAppDays >= 7) {
        if (total === 0) {
          reason = "No applications yet";
          reasonCode = "noApplications";
          severity = "critical";
        } else {
          reason = "No applications in 7 days";
          reasonCode = "noApplicationsWeek";
          severity = "danger";
        }
      } else if (ageDays >= RISK_WINDOW_DAYS && hiresLast30 === 0) {
        reason = "No hires in 30+ days";
        reasonCode = "noHires";
        severity = "danger";
      } else if (total >= 5 && hiresEver / total < 0.1) {
        reason = "Low conversion rate";
        reasonCode = "lowConversion";
        severity = "warning";
      }

      return reason && reasonCode ? { id: r.id, title: r.title, reason, reasonCode, severity } : null;
    })
    .filter(
      (r): r is { id: string; title: string; reason: string; reasonCode: "noApplications" | "noApplicationsWeek" | "noHires" | "lowConversion"; severity: "critical" | "danger" | "warning" } =>
        r !== null,
    )
    .slice(0, 4);
});

// ── Hiring performance (KPIs + daily series) ────────────────────────────────

/** Percent change, or null with no previous value (rendered as a dash). */
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Hiring performance over the last 14 local days, compared with the 14 days
 * before. Every headline number comes from the canonical metric functions, and
 * the Reports page uses the same ones.
 */
export const getHiringPerformance = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  // The canonical metrics cannot be filtered by job, so a restricted actor
  // must not see them at all. Callers check getDashboardWidgetAccess first.
  if (!actorHasPermission(actor, "reports:read") || !isUnrestrictedScope(actor.scope)) {
    throw new Error("You do not have access to hiring performance.");
  }
  const timeZone = await getWorkspaceTimeZone(workspace.id);
  const now = new Date();
  const current = resolveWindow(PERF_DAYS, timeZone, now);
  const prior = previousWindow(current, now);
  const scope = { workspaceId: workspace.id };

  const [kpis, priorKpis, applicationDays, interviewDays, hireDays, priorInterviewDays] =
    await Promise.all([
      getHiringKpis({ ...scope, window: current }),
      getHiringKpis({ ...scope, window: prior }),
      getDailySeries({ ...scope, window: current }, "applications"),
      getDailySeries({ ...scope, window: current }, "interviews"),
      getDailySeries({ ...scope, window: current }, "hires"),
      getDailySeries({ ...scope, window: prior }, "interviews"),
    ]);

  const sum = (points: { count: number }[]) => points.reduce((total, p) => total + p.count, 0);
  const interviewsNow = sum(interviewDays);
  const interviewsBefore = sum(priorInterviewDays);
  const rateNow = kpis.offers.rate;
  const ratePrior = priorKpis.offers.rate;
  const acceptanceDelta = rateNow != null && ratePrior != null ? rateNow - ratePrior : null;

  const toSeries = (points: { key: string; count: number }[]) =>
    points.map((p) => ({ label: dayLabel(p.key), value: p.count }));

  return {
    rangeLabel: `Last ${PERF_DAYS} days`,
    metrics: {
      applications: {
        value: kpis.applications,
        deltaPct: pctDelta(kpis.applications, priorKpis.applications),
        positive: kpis.applications >= priorKpis.applications,
        isRate: false,
      },
      interviews: {
        value: interviewsNow,
        deltaPct: pctDelta(interviewsNow, interviewsBefore),
        positive: interviewsNow >= interviewsBefore,
        isRate: false,
      },
      hires: {
        value: kpis.hires,
        deltaPct: pctDelta(kpis.hires, priorKpis.hires),
        positive: kpis.hires >= priorKpis.hires,
        isRate: false,
      },
      offerAcceptance: {
        value: rateNow,
        deltaPct: acceptanceDelta == null ? null : Math.round(acceptanceDelta),
        positive: acceptanceDelta == null ? true : acceptanceDelta >= 0,
        isRate: true,
      },
    },
    series: {
      applications: toSeries(applicationDays),
      interviews: toSeries(interviewDays),
      hires: toSeries(hireDays),
    },
  };
});

// ── Decisions waiting (job approvals) ───────────────────────────────────────

const APPROVALS_SHOWN = 5;

/**
 * Decisions waiting on the viewer that are not candidate reviews: draft jobs
 * awaiting approval (`jobs:approve`). Candidate reviews live in the review
 * queue and scheduling in `getInterviewsToSchedule`, so nothing repeats here.
 */
export const getInbox = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "jobs:approve")) return { total: 0, items: [] };

  const drafts = await db
    .select({ id: jobs.id, title: jobs.title, createdAt: jobs.createdAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "draft"),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
      ),
    )
    .orderBy(asc(jobs.createdAt), asc(jobs.id));

  return {
    total: drafts.length,
    items: drafts.slice(0, APPROVALS_SHOWN).map((job) => ({
      id: job.id,
      title: job.title,
      subtitle: "Job description awaiting approval",
      ageDays: daysSince(job.createdAt),
      href: `/dashboard/jobs/${job.id}`,
    })),
  };
});

export type PipelineOverview = Awaited<ReturnType<typeof getPipelineOverview>>;
export type ReviewCandidates = Awaited<ReturnType<typeof getCandidatesNeedingReview>>;
export type InterviewsToSchedule = Awaited<ReturnType<typeof getInterviewsToSchedule>>;
export type TodayInterview = Awaited<ReturnType<typeof getTodayInterviews>>["items"][number];
export type RiskJob = Awaited<ReturnType<typeof getJobsAtRisk>>[number] & {
  severity: "critical" | "danger" | "warning";
};
export type HiringPerformance = Awaited<ReturnType<typeof getHiringPerformance>>;
export type InboxItem = Awaited<ReturnType<typeof getInbox>>["items"][number];

// ── My tasks (dashboard widget) ─────────────────────────────────────────────

const TASKS_SHOWN = 6;

/**
 * My open tasks (pending or in progress). `total` counts them all and
 * `dueNow` the overdue-or-due-today subset: the exact set
 * `/dashboard/tasks?owner=me&due=overdue,today` lists. `items` is the first few
 * by priority, then due date.
 */
export const getMyDashboardTasks = cache(async () => {
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "tasks:read")) return { total: 0, dueNow: 0, items: [] };
  const { organization: workspace, user: currentUser } = await getWorkspaceContext();
  const now = new Date();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      status: tasks.status,
      candidateFirst: candidates.firstName,
      candidateLast: candidates.lastName,
      candidateId: tasks.candidateId,
      jobTitle: jobs.title,
    })
    .from(tasks)
    .leftJoin(
      candidates,
      and(
        eq(candidates.id, tasks.candidateId),
        eq(candidates.workspaceId, tasks.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .leftJoin(
      jobs,
      and(
        eq(jobs.id, tasks.jobId),
        eq(jobs.workspaceId, tasks.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(tasks.workspaceId, workspace.id),
        isNull(tasks.deletedAt),
        eq(tasks.ownerId, currentUser.id),
        or(eq(tasks.status, "pending"), eq(tasks.status, "in_progress")),
        taskScopeSql(actor),
      ),
    )
    .orderBy(
      asc(
        sql`CASE ${tasks.priority}
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END`,
      ),
      asc(tasks.dueDate),
    );

  const open = rows.map((r) => {
    const dueState = taskDueState(r.dueDate?.toISOString() ?? null, now);

    return {
      id: r.id,
      title: r.title,
      priority: r.priority as "urgent" | "high" | "medium" | "low",
      status: r.status as "pending" | "in_progress",
      dueDate: r.dueDate?.toISOString() ?? null,
      dueState,
      context:
        r.candidateFirst && r.candidateLast
          ? `${r.candidateFirst} ${r.candidateLast}`
          : r.jobTitle ?? null,
      candidateId: r.candidateId,
    };
  });

  return {
    total: open.length,
    dueNow: open.filter((t) => t.dueState === "overdue" || t.dueState === "today").length,
    items: open.slice(0, TASKS_SHOWN),
  };
});

export type MyDashboardTask = Awaited<ReturnType<typeof getMyDashboardTasks>>["items"][number];
