import "server-only";

import { cache } from "react";
import { and, asc, count, desc, eq, exists, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  applications,
  applicationStageHistory,
  candidates,
  db,
  effectiveStageKind,
  effectiveStageKindSql,
  interviews,
  jobs,
  jobStages,
  scorecards,
  stageIsAnyKindSql,
  tasks,
  user,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { candidateAvatarFallbackSrcs } from "@/lib/candidate-avatar";
import { getWorkspaceGravatarEnabled } from "@/lib/gravatar";
import {
  getDailySeries,
  getHiresByJob,
  getHiringKpis,
  getWorkspaceTimeZone,
} from "@/features/reports/canonical";
import { dayLabel, allTimeWindow, previousWindow, resolveWindow } from "@/features/reports/window";
import {
  actorHasPermission,
  isUnrestrictedScope,
  jobScopeSql,
  taskScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";
import { resolveSearchActor } from "@/features/search/workspace-search";
import type { Permission } from "@/features/workspaces/permissions";
import { taskDueState } from "@/features/tasks/shared";
import { daysSince } from "@/lib/date";

const DAY_MS = 86_400_000;
const PERF_DAYS = 14;
/** Review-stage logic keys off stage kind, never the display name. */
const REVIEW_KINDS = ["screening", "interview"] as const;
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
  pipeline: boolean;
  inbox: boolean;
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
    pipeline: has("candidates:view"),
    inbox: has("candidates:view") || has("jobs:approve"),
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

export const getTodayInterviews = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!hasAnyPermission(actor, ["interviews:manage", "interviews:feedback"])) return [];
  // "Today" is the workspace's local day, not the server's.
  const timeZone = await getWorkspaceTimeZone(workspace.id);
  const today = resolveWindow(1, timeZone, new Date());
  const start = today.from;
  const end = today.to;

  const rows = await db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      type: interviews.type,
      title: interviews.title,
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

  return rows.map((r) => ({
    id: r.id,
    scheduledAt: r.scheduledAt,
    type: r.type,
    label: r.title ?? interviewTypeLabel(r.type),
    candidate: `${r.first} ${r.last}`,
    job: r.jobTitle,
    interviewer: r.interviewer ?? null,
    interviewerImage: r.interviewerImage ?? null,
    gcalEventId: r.gcalEventId,
  }));
});

// ── Candidates needing review (with aging) ──────────────────────────────────

export const getCandidatesNeedingReview = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "candidates:view")) return [];
  const gravatarEnabled = await getWorkspaceGravatarEnabled(workspace.id);

  const [rows, enteredRows] = await Promise.all([
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
        stageName: jobStages.name,
        stageKind: effectiveStageKindSql(jobStages),
        appliedAt: applications.appliedAt,
        scorecardId: scorecards.id,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, applications.candidateId),
        isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.workspaceId, workspace.id),
          eq(jobs.id, applications.jobId),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.workspaceId, workspace.id),
          eq(jobStages.id, applications.currentStageId),
          stageIsAnyKindSql(jobStages, REVIEW_KINDS),
          isNull(jobStages.archivedAt),
        ),
      )
      // A submitted scorecard for the current stage means the review is done.
      .leftJoin(
        scorecards,
        and(
          eq(scorecards.workspaceId, workspace.id),
          eq(scorecards.candidateId, applications.candidateId),
          eq(scorecards.stageName, jobStages.name),
        ),
      )
      .where(
        and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.status, "active"),
        isNull(candidates.deletedAt),
        jobScopeSql(actor),
        ),
      ),
    db
      .select({
        applicationId: applicationStageHistory.applicationId,
        at: sql<string>`max(${applicationStageHistory.createdAt})`,
      })
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.workspaceId, workspace.id))
      .groupBy(applicationStageHistory.applicationId),
  ]);

  const enteredAt = new Map(enteredRows.map((r) => [r.applicationId, r.at]));

  return rows
    .filter((r) => r.scorecardId === null)
    .map((r) => {
      const since = enteredAt.get(r.applicationId) ?? r.appliedAt;
      return {
        id: r.applicationId,
        candidateId: r.candidateId,
        name: `${r.first} ${r.last}`,
        avatarUrl: r.avatarUrl,
        avatarFallbackSrcs: candidateAvatarFallbackSrcs(r.email, r.githubUrl, { gravatarEnabled }),
        job: r.jobTitle,
        stage: r.stageName,
        action: r.stageKind === "interview" ? "Interview feedback" : "Resume review",
        ageDays: daysSince(since),
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 5);
});

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
      let severity: "critical" | "danger" | "warning" = "danger";
      if (lastAppDays >= 7) {
        if (total === 0) {
          reason = "No applications yet";
          severity = "critical";
        } else {
          reason = "No applications in 7 days";
          severity = "danger";
        }
      } else if (ageDays >= RISK_WINDOW_DAYS && hiresLast30 === 0) {
        reason = "No hires in 30+ days";
        severity = "danger";
      } else if (total >= 5 && hiresEver / total < 0.1) {
        reason = "Low conversion rate";
        severity = "warning";
      }

      return reason ? { id: r.id, title: r.title, reason, severity } : null;
    })
    .filter(
      (r): r is { id: string; title: string; reason: string; severity: "critical" | "danger" | "warning" } =>
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

// ── Inbox (derived from real signals , no tasks table) ──────────────────────

type DueState = "overdue" | "today" | "soon";
type InboxIcon = "feedback" | "schedule" | "screen" | "approve";

export const getInbox = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const actor = await widgetActor();
  const seesCandidates = actorHasPermission(actor, "candidates:view");
  // Draft-job approvals are an approver's item, so they need jobs:approve.
  const seesDraftJobs = actorHasPermission(actor, "jobs:approve");
  if (!seesCandidates && !seesDraftJobs) return [];

  const [rows, scorecardKeys, interviewedRows, draftJobs] = await Promise.all([
    !seesCandidates ? [] : db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        first: candidates.firstName,
        last: candidates.lastName,
        jobTitle: jobs.title,
        stageName: jobStages.name,
        stageKind: effectiveStageKindSql(jobStages),
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
        eq(candidates.workspaceId, workspace.id),
        eq(candidates.id, applications.candidateId),
        isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.workspaceId, workspace.id),
          eq(jobs.id, applications.jobId),
          isNull(jobs.deletedAt),
        ),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.workspaceId, workspace.id),
          eq(jobStages.id, applications.currentStageId),
          stageIsAnyKindSql(jobStages, REVIEW_KINDS),
          isNull(jobStages.archivedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, workspace.id),
          eq(applications.status, "active"),
          jobScopeSql(actor),
        ),
      ),
    !seesCandidates ? [] : db
      .select({
        candidateId: scorecards.candidateId,
        stageName: scorecards.stageName,
      })
      .from(scorecards)
      .where(eq(scorecards.workspaceId, workspace.id)),
    !seesCandidates ? [] : db
      .select({ applicationId: interviews.applicationId })
      .from(interviews)
      .where(eq(interviews.workspaceId, workspace.id)),
    !seesDraftJobs ? [] : db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspace.id),
          eq(jobs.status, "draft"),
          isNull(jobs.deletedAt),
          jobScopeSql(actor),
        ),
      ),
  ]);

  const reviewed = new Set(
    scorecardKeys.map((k) => `${k.candidateId}::${k.stageName ?? ""}`),
  );
  const interviewed = new Set(interviewedRows.map((r) => r.applicationId));

  type Item = {
    id: string;
    icon: InboxIcon;
    title: string;
    subtitle: string;
    due: string;
    dueState: DueState;
    href: string;
    rank: number;
  };
  const items: Item[] = [];

  for (const a of rows) {
    const name = `${a.first} ${a.last}`;
    const href = `/dashboard/candidates/${a.candidateId}`;
    const aging = daysSince(a.appliedAt);
    const hasScore = reviewed.has(`${a.candidateId}::${a.stageName}`);

    if (a.stageKind === "interview") {
      if (!interviewed.has(a.applicationId)) {
        items.push({
          id: `${a.applicationId}-schedule`,
          icon: "schedule",
          title: `Schedule interview with ${name}`,
          subtitle: a.jobTitle,
          due: "Due soon",
          dueState: "soon",
          href,
          rank: 2,
        });
      } else if (!hasScore) {
        items.push({
          id: `${a.applicationId}-feedback`,
          icon: "feedback",
          title: `Review ${name}'s interview`,
          subtitle: a.jobTitle,
          due: aging > 5 ? "Overdue" : "Due today",
          dueState: aging > 5 ? "overdue" : "today",
          href,
          rank: aging > 5 ? 0 : 1,
        });
      }
    } else if (a.stageKind === "screening" && !hasScore) {
      items.push({
        id: `${a.applicationId}-screen`,
        icon: "screen",
        title: `Send feedback for ${name}`,
        subtitle: a.jobTitle,
        due: aging > 7 ? "Overdue" : "Due today",
        dueState: aging > 7 ? "overdue" : "today",
        href,
        rank: aging > 7 ? 0 : 1,
      });
    }
  }

  for (const j of draftJobs) {
    items.push({
      id: `${j.id}-approve`,
      icon: "approve",
      title: "Approve job description",
      subtitle: j.title,
      due: "Due soon",
      dueState: "soon",
      href: `/dashboard/jobs/${j.id}`,
      rank: 3,
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, 6);
});

export const getInboxCount = cache(async () => {
  const items = await getInbox();
  return items.length;
});

export type PipelineOverview = Awaited<ReturnType<typeof getPipelineOverview>>;
export type TodayInterview = Awaited<ReturnType<typeof getTodayInterviews>>[number];
export type ReviewCandidate = Awaited<
  ReturnType<typeof getCandidatesNeedingReview>
>[number];
export type RiskJob = Awaited<ReturnType<typeof getJobsAtRisk>>[number] & {
  severity: "critical" | "danger" | "warning";
};
export type HiringPerformance = Awaited<ReturnType<typeof getHiringPerformance>>;
export type InboxItem = Awaited<ReturnType<typeof getInbox>>[number];

// ── My tasks (dashboard widget) ─────────────────────────────────────────────

export const getMyDashboardTasks = cache(async () => {
  const actor = await widgetActor();
  if (!actorHasPermission(actor, "tasks:read")) return [];
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
    )
    .limit(6);

  return rows.map((r) => {
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
});

export type MyDashboardTask = Awaited<ReturnType<typeof getMyDashboardTasks>>[number];
