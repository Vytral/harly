import "server-only";

import { cache } from "react";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import {
  applications,
  applicationStageHistory,
  candidates,
  db,
  interviews,
  jobs,
  jobStages,
  scorecards,
  user,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { daysSince, formatShort } from "@/lib/date";
import { gravatarUrl } from "@/lib/gravatar";

const DAY_MS = 86_400_000;
const PERF_DAYS = 14;
const REVIEW_STAGES = ["Screening", "Interview"];

function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  const openJobs = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
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
      color: jobStages.color,
      order: jobStages.order,
      value: count(applications.id),
    })
    .from(jobStages)
    .leftJoin(
      applications,
      and(
        eq(applications.currentStageId, jobStages.id),
        eq(applications.status, "active"),
      ),
    )
    .where(
      and(
        eq(jobStages.workspaceId, workspace.id),
        eq(jobStages.jobId, selected.id),
      ),
    )
    .groupBy(jobStages.id)
    .orderBy(asc(jobStages.order));

  // The funnel view omits the terminal "Rejected" lane.
  const stages = stageRows
    .filter((s) => s.name.toLowerCase() !== "rejected")
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
  const start = startOfDay(new Date());
  const end = new Date(start.getTime() + DAY_MS);

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
      ),
    )
    .innerJoin(
      jobs,
      and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, interviews.jobId)),
    )
    .leftJoin(user, eq(user.id, interviews.interviewerId))
    .where(
      and(
        eq(interviews.workspaceId, workspace.id),
        gte(interviews.scheduledAt, start),
        lt(interviews.scheduledAt, end),
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

  const [rows, enteredRows] = await Promise.all([
    db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        first: candidates.firstName,
        last: candidates.lastName,
        email: candidates.email,
        avatarUrl: candidates.avatarUrl,
        jobTitle: jobs.title,
        stageName: jobStages.name,
        appliedAt: applications.appliedAt,
        scorecardId: scorecards.id,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.workspaceId, workspace.id),
          eq(candidates.id, applications.candidateId),
        ),
      )
      .innerJoin(
        jobs,
        and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.workspaceId, workspace.id),
          eq(jobStages.id, applications.currentStageId),
          inArray(jobStages.name, REVIEW_STAGES),
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
        avatarUrl: r.avatarUrl || gravatarUrl(r.email),
        job: r.jobTitle,
        stage: r.stageName,
        action:
          r.stageName === "Interview" ? "Interview feedback" : "Resume review",
        ageDays: daysSince(since),
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 5);
});

// ── Jobs at risk ─────────────────────────────────────────────────────────────

export const getJobsAtRisk = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      createdAt: jobs.createdAt,
      total: count(applications.id),
      lastAppliedAt: sql<string | null>`max(${applications.appliedAt})`,
      hired: sql<number>`count(*) filter (where ${applications.status} = 'hired')`,
    })
    .from(jobs)
    .leftJoin(
      applications,
      and(
        eq(applications.workspaceId, workspace.id),
        eq(applications.jobId, jobs.id),
      ),
    )
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
      ),
    )
    .groupBy(jobs.id)
    .orderBy(asc(jobs.createdAt));

  const now = Date.now();

  return rows
    .map((r) => {
      const total = Number(r.total);
      const hired = Number(r.hired);
      const ageDays = (now - new Date(r.createdAt).getTime()) / DAY_MS;
      const lastAppDays = r.lastAppliedAt
        ? (now - new Date(r.lastAppliedAt).getTime()) / DAY_MS
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
      } else if (ageDays >= 30 && hired === 0) {
        reason = "No hires in 30+ days";
        severity = "danger";
      } else if (total >= 5 && hired / total < 0.1) {
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

function splitCount(dates: (string | Date)[], windowStart: Date) {
  let cur = 0;
  let prev = 0;
  for (const d of dates) {
    const t = new Date(d).getTime();
    if (t >= windowStart.getTime()) cur += 1;
    else prev += 1;
  }
  return { cur, prev };
}

function pctDelta(cur: number, prev: number) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function bucketSeries(dates: (string | Date)[], windowStart: Date) {
  const buckets = Array.from({ length: PERF_DAYS }, (_, i) => {
    const date = new Date(windowStart.getTime() + i * DAY_MS);
    return { label: formatShort(date), value: 0 };
  });
  for (const d of dates) {
    const idx = Math.floor(
      (startOfDay(new Date(d)).getTime() - windowStart.getTime()) / DAY_MS,
    );
    if (idx >= 0 && idx < PERF_DAYS) buckets[idx].value += 1;
  }
  return buckets;
}

export const getHiringPerformance = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();
  const now = new Date();
  const windowStart = startOfDay(new Date(now.getTime() - (PERF_DAYS - 1) * DAY_MS));
  const prevStart = new Date(windowStart.getTime() - PERF_DAYS * DAY_MS);

  const [appRows, interviewRows, hireRows, offerRows] = await Promise.all([
    db
      .select({ at: applications.appliedAt })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspace.id),
          gte(applications.appliedAt, prevStart),
        ),
      ),
    db
      .select({ at: interviews.scheduledAt })
      .from(interviews)
      .where(
        and(
          eq(interviews.workspaceId, workspace.id),
          gte(interviews.scheduledAt, prevStart),
        ),
      ),
    db
      .select({ at: applicationStageHistory.createdAt })
      .from(applicationStageHistory)
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applicationStageHistory.toStageId),
          eq(jobStages.name, "Hired"),
        ),
      )
      .where(
        and(
          eq(applicationStageHistory.workspaceId, workspace.id),
          gte(applicationStageHistory.createdAt, prevStart),
        ),
      ),
    db
      .select({ at: applicationStageHistory.createdAt })
      .from(applicationStageHistory)
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.id, applicationStageHistory.toStageId),
          inArray(jobStages.name, ["Offer", "Hired"]),
        ),
      )
      .where(
        and(
          eq(applicationStageHistory.workspaceId, workspace.id),
          gte(applicationStageHistory.createdAt, prevStart),
        ),
      ),
  ]);

  const apps = splitCount(appRows.map((r) => r.at), windowStart);
  const ivs = splitCount(interviewRows.map((r) => r.at), windowStart);
  const hires = splitCount(hireRows.map((r) => r.at), windowStart);
  const offers = splitCount(offerRows.map((r) => r.at), windowStart);

  const curRate = offers.cur > 0 ? hires.cur / offers.cur : 0;
  const prevRate = offers.prev > 0 ? hires.prev / offers.prev : 0;
  const acceptanceDelta = Math.round((curRate - prevRate) * 100);

  return {
    rangeLabel: "Last 14 days",
    metrics: {
      applications: {
        value: apps.cur,
        deltaPct: pctDelta(apps.cur, apps.prev),
        positive: apps.cur >= apps.prev,
        isRate: false,
      },
      interviews: {
        value: ivs.cur,
        deltaPct: pctDelta(ivs.cur, ivs.prev),
        positive: ivs.cur >= ivs.prev,
        isRate: false,
      },
      hires: {
        value: hires.cur,
        deltaPct: pctDelta(hires.cur, hires.prev),
        positive: hires.cur >= hires.prev,
        isRate: false,
      },
      offerAcceptance: {
        value: Math.round(curRate * 100),
        deltaPct: acceptanceDelta,
        positive: acceptanceDelta >= 0,
        isRate: true,
      },
    },
    series: {
      applications: bucketSeries(appRows.map((r) => r.at), windowStart),
      interviews: bucketSeries(interviewRows.map((r) => r.at), windowStart),
      hires: bucketSeries(hireRows.map((r) => r.at), windowStart),
    },
  };
});

// ── Inbox (derived from real signals — no tasks table) ──────────────────────

type DueState = "overdue" | "today" | "soon";
type InboxIcon = "feedback" | "schedule" | "screen" | "approve";

export const getInbox = cache(async () => {
  const { organization: workspace } = await getWorkspaceContext();

  const [rows, scorecardKeys, interviewedRows, draftJobs] = await Promise.all([
    db
      .select({
        applicationId: applications.id,
        candidateId: candidates.id,
        first: candidates.firstName,
        last: candidates.lastName,
        jobTitle: jobs.title,
        stageName: jobStages.name,
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.workspaceId, workspace.id),
          eq(candidates.id, applications.candidateId),
        ),
      )
      .innerJoin(
        jobs,
        and(eq(jobs.workspaceId, workspace.id), eq(jobs.id, applications.jobId)),
      )
      .innerJoin(
        jobStages,
        and(
          eq(jobStages.workspaceId, workspace.id),
          eq(jobStages.id, applications.currentStageId),
          inArray(jobStages.name, REVIEW_STAGES),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, workspace.id),
          eq(applications.status, "active"),
        ),
      ),
    db
      .select({
        candidateId: scorecards.candidateId,
        stageName: scorecards.stageName,
      })
      .from(scorecards)
      .where(eq(scorecards.workspaceId, workspace.id)),
    db
      .select({ applicationId: interviews.applicationId })
      .from(interviews)
      .where(eq(interviews.workspaceId, workspace.id)),
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspace.id),
          eq(jobs.status, "draft"),
          isNull(jobs.deletedAt),
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

    if (a.stageName === "Interview") {
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
    } else if (a.stageName === "Screening" && !hasScore) {
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
