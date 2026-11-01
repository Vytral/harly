import "server-only";

import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db, jobs } from "@harly/db";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";
import {
  getDailySeries,
  getHireStats,
  getHiresByJob,
  getJobFunnel,
  getOfferAcceptance,
  getSourceEffectiveness,
  getWorkspaceFunnel,
  getWorkspaceTimeZone,
} from "@/features/reports/canonical";
import { getReportsData } from "@/features/reports/data";
import { REPORTS_SCOPE_MESSAGE, ReportsScopeError } from "@/features/reports/scope";
import {
  addCalendarDays,
  percentChange,
  resolveWindow,
  zonedMidnight,
  type ReportWindow,
} from "@/features/reports/window";
import { listActivityEventsForApi, serializeActivityEvent, ACTIVITY_ENTITY_TYPES } from "@/features/activity/service";
import {
  getCandidatesNeedingReview,
  getDashboardWidgetAccess,
  getHiringPerformance,
  getInbox,
  getJobsAtRisk,
  getMyDashboardTasks,
  getPipelineOverview,
} from "@/features/dashboard/widgets";
import { isUnrestrictedScope } from "@/features/search/scope";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import { listScheduledReports } from "@/server/reports/scheduled";

import { defineMcpTool, McpToolError, type McpToolDefinition } from "../../types";
import { appLink, guarded, isoOrNull, pageFields } from "./shared";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 800;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date like 2026-09-30.");

/** Date range fields shared by the report tools. */
const rangeFields = {
  days: z
    .number()
    .int()
    .min(1)
    .max(MAX_RANGE_DAYS)
    .default(30)
    .describe("Trailing window of N calendar days ending today (workspace time zone). Default 30. Ignored when from and to are both set."),
  from: dateKey.optional().describe("Custom range start, YYYY-MM-DD (inclusive, workspace time zone). Use together with `to`."),
  to: dateKey.optional().describe("Custom range end, YYYY-MM-DD (inclusive). Use together with `from`."),
};

export type RangeInput = { days?: number; from?: string; to?: string };

export type ResolvedRange = {
  window: ReportWindow;
  /** The equal-length window immediately before `window`, for period-over-period comparison. */
  previous: ReportWindow;
  label: string;
};

function parseDateKey(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new McpToolError(`"${value}" is not a valid calendar date.`, "invalid_input");
  }
  return { year, month, day };
}

/**
 * Turn the tool's range inputs into a canonical report window. A custom
 * `from`/`to` pair (both inclusive calendar days) wins over `days`. The result
 * always has `days` set, so day-bucketed series work for custom ranges too.
 * Pure (apart from `now`) so it is unit-tested.
 */
export function resolveReportRange(input: RangeInput, timeZone: string, now: Date = new Date()): ResolvedRange {
  if ((input.from && !input.to) || (!input.from && input.to)) {
    throw new McpToolError("Pass both from and to for a custom range, or neither.", "invalid_input");
  }
  if (input.from && input.to) {
    const start = parseDateKey(input.from);
    const end = parseDateKey(input.to);
    const spanDays =
      Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY_MS) + 1;
    if (spanDays < 1) throw new McpToolError("`to` must not be before `from`.", "invalid_input");
    if (spanDays > MAX_RANGE_DAYS) {
      throw new McpToolError(`Custom ranges are limited to ${MAX_RANGE_DAYS} days.`, "invalid_input");
    }
    const from = zonedMidnight(start, timeZone);
    const to = zonedMidnight(addCalendarDays(end, 1), timeZone);
    const window: ReportWindow = { from, to, timeZone, days: spanDays };
    const previous: ReportWindow = {
      from: zonedMidnight(addCalendarDays(start, -spanDays), timeZone),
      to: from,
      timeZone,
      days: spanDays,
    };
    return { window, previous, label: `${input.from} to ${input.to}` };
  }
  const days = Math.min(Math.max(Math.trunc(input.days ?? 30) || 30, 1), MAX_RANGE_DAYS);
  const window = resolveWindow(days, timeZone, now);
  const previous = resolveWindow(days, timeZone, now, days);
  return { window, previous, label: days === 365 ? "Last 12 months" : `Last ${days} days` };
}

function windowOut(range: ResolvedRange) {
  return {
    label: range.label,
    from: range.window.from.toISOString(),
    to: range.window.to.toISOString(),
    timeZone: range.window.timeZone,
    days: range.window.days,
  };
}

/** Reports are workspace-wide; roles limited to specific jobs get nothing. */
async function reportsContext() {
  const context = await requirePermission("reports:read");
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  if (!isUnrestrictedScope(policy.scope)) throw new McpToolError(REPORTS_SCOPE_MESSAGE, "forbidden");
  const timeZone = await getWorkspaceTimeZone(context.organization.id);
  return { workspaceId: context.organization.id, scope: policy.scope, timeZone };
}

async function withRange(input: RangeInput) {
  const base = await reportsContext();
  const range = resolveReportRange(input, base.timeZone);
  return { ...base, range };
}

function mapScope<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (error instanceof ReportsScopeError) throw new McpToolError(error.message, "forbidden");
    throw error;
  });
}

function delta(current: number | null, previous: number | null) {
  return {
    current,
    previous,
    deltaPct: current != null && previous != null ? percentChange(current, previous) : null,
  };
}

async function advancedAnalytics(input: RangeInput) {
  const { workspaceId, scope, range } = await withRange(input);
  const data = await mapScope(getAdvancedHiringAnalytics({ workspaceId, window: range.window, actor: { scope } }));
  return { range, data };
}

export const reportsTools: McpToolDefinition[] = [
  defineMcpTool({
    name: "reports_overview",
    title: "Hiring overview report",
    description:
      "The Reports page in one call: open roles, candidates, applications, hires, average time to hire and offer acceptance for a window, the funnel by stage kind, source effectiveness, time-to-hire buckets, comparison with the previous period, and 12-month applications/hires trends. Workspace-wide: roles limited to specific jobs are refused. For one job's funnel use reports_funnel with jobId.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({
      days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(30).describe("Window: 30, 90 or 365 trailing days (same options as the Reports page)."),
    }),
    async run(input, ctx) {
      const data = await mapScope(getReportsData(input.days));
      return { ...data, url: appLink(ctx.appOrigin, `/dashboard/reports?range=${input.days}`) };
    },
  }),

  defineMcpTool({
    name: "reports_funnel",
    title: "Hiring funnel",
    description:
      "Conversion funnel for applications received in a window: how many reached Applied, Screening, Interview, Offer and Hired, the share of all applications, and how many sit in each stage now. Pass jobId (from jobs_list) for that job's own stage-by-stage funnel including custom stages. Window = trailing `days` or a custom from/to.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({
      jobId: z.string().uuid().optional().describe("Limit to one job (id from jobs_list). Omit for the whole workspace."),
      ...rangeFields,
    }),
    async run(input, ctx) {
      const { workspaceId, range } = await withRange(input);
      const funnel = input.jobId
        ? await getJobFunnel({ workspaceId, jobId: input.jobId, window: range.window })
        : await getWorkspaceFunnel({ workspaceId, window: range.window });
      return { window: windowOut(range), jobId: input.jobId ?? null, ...funnel, url: appLink(ctx.appOrigin, "/dashboard/reports") };
    },
  }),

  defineMcpTool({
    name: "reports_time_to_hire",
    title: "Time to hire",
    description:
      "Hires in a window with average and median days from application to hire, the distribution buckets, and the same numbers for the previous equal-length window with the percent change (negative = faster hiring).",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input) {
      const { workspaceId, range } = await withRange(input);
      const [current, previous] = await Promise.all([
        getHireStats({ workspaceId, window: range.window }),
        getHireStats({ workspaceId, window: range.previous }),
      ]);
      return {
        window: windowOut(range),
        hires: current.hires,
        measured: current.measured,
        averageDays: current.averageDays,
        medianDays: current.medianDays,
        buckets: current.buckets,
        comparison: {
          hires: delta(current.hires, previous.hires),
          averageDays: delta(current.averageDays, previous.averageDays),
          medianDays: delta(current.medianDays, previous.medianDays),
        },
      };
    },
  }),

  defineMcpTool({
    name: "reports_sources",
    title: "Source effectiveness",
    description: "Applications, hires and hire conversion (%) per application source (career page, referral, LinkedIn...) for a window, best sources first.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input) {
      const { workspaceId, range } = await withRange(input);
      const sources = await getSourceEffectiveness({ workspaceId, window: range.window });
      return { window: windowOut(range), sources };
    },
  }),

  defineMcpTool({
    name: "reports_stage_durations",
    title: "Stage durations and SLA",
    description:
      "How long applications spend in each pipeline stage before moving on (transitions that started in the window): count, average and median days, and how many exceeded the 7-day SLA. Use it to find bottleneck stages.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input) {
      const { range, data } = await advancedAnalytics(input);
      return { window: windowOut(range), slaDays: 7, stages: data.stageSla };
    },
  }),

  defineMcpTool({
    name: "reports_offer_acceptance",
    title: "Offer acceptance",
    description: "Offers accepted vs declined (by decision date) in a window, the acceptance rate, and the previous period for comparison.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input) {
      const { workspaceId, range } = await withRange(input);
      const [current, previous] = await Promise.all([
        getOfferAcceptance({ workspaceId, window: range.window }),
        getOfferAcceptance({ workspaceId, window: range.previous }),
      ]);
      return { window: windowOut(range), ...current, previous, rateDeltaPoints: current.rate != null && previous.rate != null ? current.rate - previous.rate : null };
    },
  }),

  defineMcpTool({
    name: "reports_diversity",
    title: "Diversity report",
    description:
      "Aggregate diversity analytics (gender, ethnicity, disability, veteran status from voluntary self-identification): applicants, distinct people, hires and conversion per group. Groups with fewer than 5 people are suppressed (suppressed: true, no counts) to protect privacy; hire counts of 1-4 are withheld. Never individual data.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input) {
      const { range, data } = await advancedAnalytics(input);
      return { window: windowOut(range), minimumGroupSize: 5, groups: data.diversity };
    },
  }),

  defineMcpTool({
    name: "reports_hires_by_job",
    title: "Hires per job",
    description: "Number of hires dated in the window for each job, highest first, with job titles and links.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({ ...rangeFields }),
    async run(input, ctx) {
      const { workspaceId, range } = await withRange(input);
      const byJob = await getHiresByJob({ workspaceId, window: range.window });
      const ids = [...byJob.keys()];
      const titles = ids.length
        ? await db.select({ id: jobs.id, title: jobs.title }).from(jobs).where(inArray(jobs.id, ids))
        : [];
      const titleById = new Map(titles.map((row) => [row.id, row.title]));
      const rows = ids
        .map((id) => ({ jobId: id, title: titleById.get(id) ?? null, hires: byJob.get(id) ?? 0, url: appLink(ctx.appOrigin, `/dashboard/jobs/${id}`) }))
        .sort((a, b) => b.hires - a.hires);
      return { window: windowOut(range), totalHires: rows.reduce((sum, row) => sum + row.hires, 0), jobs: rows };
    },
  }),

  defineMcpTool({
    name: "reports_time_series",
    title: "Daily time series",
    description: "Zero-filled daily counts (in the workspace time zone) of applications received, hires, or interviews scheduled across a window. Use for trend questions and charts. Windows are capped at 366 days.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({
      metric: z.enum(["applications", "hires", "interviews"]).describe("What to count per day."),
      ...rangeFields,
    }),
    async run(input) {
      const { workspaceId, range } = await withRange(input);
      if ((range.window.days ?? 0) > 366) {
        throw new McpToolError("Daily series are limited to 366 days; use a shorter window.", "invalid_input");
      }
      const points = await getDailySeries({ workspaceId, window: range.window }, input.metric);
      return {
        window: windowOut(range),
        metric: input.metric,
        total: points.reduce((sum, point) => sum + point.count, 0),
        points: points.map((point) => ({ date: point.key, count: point.count })),
      };
    },
  }),

  defineMcpTool({
    name: "reports_dashboard_summary",
    title: "Home dashboard summary",
    description:
      "What the Harly home dashboard shows for you: pipeline counts per stage for a job (default: the busiest open job), your open tasks and how many are due, 14-day hiring performance with trends, jobs at risk (stalled, no applicants...), candidates waiting for review, and job approvals waiting on you. Each section appears only when your role may see it (see `access`).",
    group: "reports",
    scope: "reports:read",
    permission: null,
    annotations: READ,
    input: z.object({
      jobId: z.string().uuid().optional().describe("Open job to show the pipeline for. Default: the job with the most active candidates."),
    }),
    async run(input, ctx) {
      const access = await getDashboardWidgetAccess();
      const [pipeline, myTasks, performance, atRisk, review, approvals] = await Promise.all([
        access.pipeline ? getPipelineOverview(input.jobId) : null,
        access.tasks ? getMyDashboardTasks() : null,
        access.performance ? getHiringPerformance() : null,
        access.performance ? getJobsAtRisk() : null,
        access.reviewCandidates ? getCandidatesNeedingReview() : null,
        access.approvals ? getInbox() : null,
      ]);
      return {
        access,
        pipeline: pipeline
          ? {
              selectedJob: pipeline.selected,
              totalActive: pipeline.total,
              stages: pipeline.stages.map((stage: { name: string; count: number }) => ({ stage: stage.name, count: stage.count })),
              openJobs: pipeline.jobs.map((job: { id: string; title: string }) => ({ id: job.id, title: job.title })),
            }
          : null,
        myTasks,
        hiringPerformance: performance,
        jobsAtRisk: atRisk,
        needsReview: review
          ? {
              total: review.total,
              items: review.items.slice(0, 10).map((item) => ({
                applicationId: item.applicationId,
                candidateId: item.candidateId,
                name: item.name,
                job: item.job,
                stage: item.stage,
                action: item.action,
                waitingDays: item.ageDays,
              })),
            }
          : null,
        jobApprovalsWaiting: approvals,
        url: appLink(ctx.appOrigin, "/dashboard"),
      };
    },
  }),

  defineMcpTool({
    name: "reports_scheduled_list",
    title: "Scheduled report emails",
    description: "List the recurring report emails configured in the workspace (name, frequency, report type, recipients, next run, and the last run's status or skip reason). Read-only.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({}),
    async run() {
      const { workspaceId } = await reportsContext();
      const rows = await listScheduledReports(workspaceId);
      return {
        schedules: rows.map((row) => ({
          id: row.id,
          name: row.name,
          frequency: row.frequency,
          reportType: row.reportType,
          recipients: row.recipients,
          nextRunAt: isoOrNull(row.nextRunAt),
          lastRun: row.lastRun
            ? { status: row.lastRun.status, error: row.lastRun.error, at: isoOrNull(row.lastRun.createdAt) }
            : null,
        })),
      };
    },
  }),

  defineMcpTool({
    name: "reports_activity_list",
    title: "Workspace activity feed",
    description:
      "Recent activity events across the workspace (stage moves, notes, tasks, documents, job changes), newest first, with who did it. Metadata is limited to PII-safe ids and statuses. Filter by entityType (+ entityId) or event type such as application.stage_changed. Requires an unrestricted role scope.",
    group: "reports",
    scope: "reports:read",
    permission: "reports:read",
    annotations: READ,
    input: z.object({
      entityType: z.enum(ACTIVITY_ENTITY_TYPES).optional().describe("Only events about this kind of record."),
      entityId: z.string().uuid().optional().describe("Only events about this record (requires entityType)."),
      type: z.string().trim().max(80).optional().describe("Exact event type, e.g. task.completed."),
      limit: pageFields.limit,
    }),
    async run(input) {
      const { workspaceId } = await reportsContext();
      if (input.entityId && !input.entityType) throw new McpToolError("entityType is required with entityId.", "invalid_input");
      const rows = await guarded(
        () =>
          listActivityEventsForApi({
            workspaceId,
            entityType: input.entityType,
            entityId: input.entityId,
            type: input.type,
            cursor: null,
            limit: input.limit,
          }),
        "Could not load activity.",
      );
      const items = rows.slice(0, input.limit).map((row) => serializeActivityEvent(row));
      return { items, hasMore: rows.length > input.limit };
    },
  }),
];
