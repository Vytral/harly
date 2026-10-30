"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Clock,
  Download,
  Funnel,
  Hourglass,
  LineChart,
  Minus,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Tile, tileClass } from "@/components/dashboard/widgets/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toSafeCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import {
  FunnelChart,
  Histogram,
  SourceBars,
  TrendChart,
  type SourceDatum,
  type TrendSeries,
} from "./charts";
import type { ReportsData } from "./data";
import { REPORT_RANGE_DAYS, reportRangeLabel } from "./ranges";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const RANGE_OPTIONS = REPORT_RANGE_DAYS.map((days) => ({
  value: String(days),
  label: reportRangeLabel(days),
}));

function formatSource(source: string) {
  if (source === "unknown") return "Unknown";
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDataAsOf(generatedAt: string, timeZone: string) {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return "Data as of an unknown time";
  const formatted = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
  return `Data as of ${formatted} (${timeZone})`;
}

function formatDays(value: number | null) {
  return value == null ? "No data" : `${Math.round(value)}d`;
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;

type EmptyPanelAction = { href: Route; label: string };

function EmptyPanel({ icon: Icon, text, action }: { icon: IconComponent; text: string; action?: EmptyPanelAction }) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-mist-border px-6 py-10 text-center">
      <Icon className="size-5 text-quiet-mist" strokeWidth={1.6} />
      <p className="text-sm text-soft-ink">{text}</p>
      {action ? (
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** A delta badge. `null` means there is nothing to compare, shown as a dash. */
function DeltaBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
        aria-label="No prior period to compare"
      >
        <Minus className="size-3" />
        —
      </span>
    );
  }
  const positive = invert ? value <= 0 : value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const shown = invert ? -value : value;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        positive ? "bg-success-olive/10 text-success-olive" : "bg-danger-rust/10 text-danger-rust",
      )}
    >
      <Icon className="size-3" />
      {shown >= 0 ? "+" : ""}
      {shown}%
    </span>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  invertDelta,
  index,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  hint: string;
  /** `undefined` hides the badge; `null` shows a dash. */
  delta?: number | null;
  invertDelta?: boolean;
  index: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: index * 0.05 }}
      className="p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-warm-paper text-soft-ink">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        {delta !== undefined ? <DeltaBadge value={delta} invert={invertDelta} /> : null}
      </div>
      <p className="mt-4 text-xs font-medium text-soft-ink">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-near-ink">{value}</p>
      <p className="mt-1 truncate text-xs text-soft-ink">{hint}</p>
    </motion.div>
  );
}

function CardHead({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: IconComponent;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="flex items-center gap-2 text-[15px] font-medium text-near-ink">
        <Icon className="size-4 text-soft-ink" strokeWidth={1.8} />
        {title}
      </h2>
      <p className="text-sm text-soft-ink">{subtitle}</p>
    </div>
  );
}

/** Data for screen readers that mirrors a chart, visually hidden. */
function ChartTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportsDashboard({ data, canViewCandidates = false, canViewJobs = false }: {
  data: ReportsData;
  canViewCandidates?: boolean;
  canViewJobs?: boolean;
}) {
  const pipelineAction: EmptyPanelAction | undefined = canViewCandidates && canViewJobs
    ? { href: "/dashboard/pipeline", label: "View pipeline" }
    : canViewCandidates ? { href: "/dashboard/candidates", label: "View candidates" } : undefined;
  const jobsAction: EmptyPanelAction | undefined = canViewJobs
    ? { href: "/dashboard/jobs", label: "View jobs" }
    : pipelineAction;
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { summary, comparison, range } = data;
  const rangeLabel = range.label;
  const rangeLower = rangeLabel.toLowerCase();
  const applicationsTotal = data.applicationsByMonth.reduce((s, p) => s + p.count, 0);
  const hiresLast12 = data.hiresByMonth.reduce((s, p) => s + p.count, 0);
  const offersDecided = summary.offers.accepted + summary.offers.declined;
  const hasFunnel = data.funnel.some((s) => s.count > 0);
  const hasTimeToHire = data.timeToHire.some((bucket) => bucket.count > 0);

  const trendSeries: TrendSeries[] = useMemo(
    () => [
      {
        key: "applications",
        label: "Applications",
        color: "var(--chart-1)",
        points: data.applicationsByMonth.map((p) => ({ label: p.label, sub: p.month, value: p.count })),
      },
      {
        key: "hires",
        label: "Hires",
        color: "var(--chart-2)",
        points: data.hiresByMonth.map((p) => ({ label: p.label, sub: p.month, value: p.count })),
      },
    ],
    [data.applicationsByMonth, data.hiresByMonth],
  );

  const sourceData: SourceDatum[] = useMemo(
    () =>
      data.sources.map((s) => ({
        source: s.source,
        label: formatSource(s.source),
        candidates: s.applications,
        hires: s.hires,
        conversion: s.conversion,
      })),
    [data.sources],
  );

  function exportReportCsv() {
    const scope = `${rangeLabel} (${data.timeZone})`;
    const rows: string[][] = [
      ["Harly hiring report"],
      ["Range", rangeLabel],
      ["Time zone", data.timeZone],
      ["Generated at (UTC)", data.generatedAt],
      [],
      ["Metric", "Scope", "Value"],
      ["Applications received", scope, String(comparison.applications.current)],
      ["Applications received", "Previous period", String(comparison.applications.previous)],
      ["Hires", scope, String(comparison.hires.current)],
      ["Hires", "Previous period", String(comparison.hires.previous)],
      ["Average time to hire (days)", scope, data.timeToHireStats.measured > 0 ? String(comparison.avgTimeToHireDays.current) : ""],
      ["Median time to hire (days)", scope, data.timeToHireStats.medianDays == null ? "" : String(data.timeToHireStats.medianDays)],
      ["Offer acceptance (%)", scope, summary.offerAcceptRate == null ? "" : String(summary.offerAcceptRate)],
      ["Offers accepted", scope, String(summary.offers.accepted)],
      ["Offers declined", scope, String(summary.offers.declined)],
      ["Open roles", "Current", String(summary.openRoles)],
      ["Candidates tracked", "All time", String(summary.totalCandidates)],
      [],
      ["Funnel stage", `Reached, ${scope}`, "Share of applications received (%)", "Active now"],
      ...data.funnel.map((stage) => [
        stage.name,
        String(stage.count),
        stage.pct == null ? "" : String(stage.pct),
        String(stage.activeNow),
      ]),
      [],
      ["Time to hire (days)", `Hires, ${scope}`],
      ...data.timeToHire.map((bucket) => [bucket.bucket, String(bucket.count)]),
      [],
      ["Source", `Applications, ${scope}`, `Hires, ${scope}`, "Conversion (%)"],
      ...data.sources.map((source) => [
        formatSource(source.source),
        String(source.applications),
        String(source.hires),
        source.conversion == null ? "" : String(source.conversion),
      ]),
      [],
      ["Applications by month", "Last 12 months, zone-local", "Count"],
      ...data.applicationsByMonth.map((point) => ["Applications", point.month, String(point.count)]),
      [],
      ["Hires by month", "Last 12 months, zone-local", "Count"],
      ...data.hiresByMonth.map((point) => ["Hires", point.month, String(point.count)]),
    ];
    const blob = new Blob([String.fromCharCode(0xfeff) + toSafeCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `harly-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const stats = [
    {
      icon: Users,
      label: "Applications",
      value: comparison.applications.current.toLocaleString(),
      hint: `Received ${rangeLower}`,
      delta: comparison.applications.deltaPct,
    },
    {
      icon: Briefcase,
      label: "Hires",
      value: comparison.hires.current.toLocaleString(),
      hint: `Hired ${rangeLower}`,
      delta: comparison.hires.deltaPct,
    },
    {
      icon: Clock,
      label: "Avg time to hire",
      value: formatDays(summary.avgTimeToHireDays),
      hint: summary.avgTimeToHireDays == null
        ? `No hires ${rangeLower}`
        : `Apply to hire, hires ${rangeLower}`,
      delta: comparison.avgTimeToHireDays.deltaPct,
      invertDelta: true,
    },
    {
      icon: TrendingUp,
      label: "Offer acceptance",
      value: formatPercent(summary.offerAcceptRate),
      hint: offersDecided > 0
        ? `${summary.offers.accepted} of ${offersDecided} decided offers, ${rangeLower}`
        : `No offers decided ${rangeLower}`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-near-ink">Reports</h1>
          <p className="mt-1 text-sm text-soft-ink">
            {`Hiring performance and pipeline health, ${rangeLower}.`}
          </p>
          <p className="mt-1 text-xs text-soft-ink">{formatDataAsOf(data.generatedAt, data.timeZone)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(comparison.rangeDays)}
            onValueChange={(v) => router.push(`/dashboard/reports?range=${v}`)}
          >
            <SelectTrigger className="h-9 w-auto min-w-40 text-sm">
              <SelectValue>{rangeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportReportCsv}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div
        className={cn(
          tileClass,
          "grid grid-cols-1 divide-y divide-hairline sm:grid-cols-2 sm:divide-y-0 sm:divide-x xl:grid-cols-4",
        )}
      >
        {stats.map((s, i) => (
          <StatCell key={s.label} {...s} index={i} />
        ))}
      </div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.15 }}
      >
        <Tile className="gap-5 p-5">
          <CardHead
            icon={LineChart}
            title="Hiring trend"
            subtitle="Applications received vs. hires made, by month. Scope: last 12 months."
          />
          {applicationsTotal > 0 || hiresLast12 > 0 ? (
            <>
              <TrendChart series={trendSeries} />
              <ChartTable
                caption="Applications and hires by month, last 12 months"
                headers={["Month", "Applications", "Hires"]}
                rows={data.applicationsByMonth.map((point, i) => [
                  point.month,
                  point.count,
                  data.hiresByMonth[i]?.count ?? 0,
                ])}
              />
            </>
          ) : (
            <EmptyPanel icon={LineChart} text="The trend appears once applications arrive." action={jobsAction} />
          )}
        </Tile>
      </motion.div>

      <motion.section
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.2 }}
        className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <Tile className="gap-5 p-5">
          <CardHead
            icon={Funnel}
            title="Funnel"
            subtitle={`Applications received ${rangeLower} that reached each stage.`}
          />
          {hasFunnel ? (
            <>
              <FunnelChart stages={data.funnel} />
              <ChartTable
                caption={`Funnel, applications received ${rangeLower}`}
                headers={["Stage", "Reached", "Share of applications received", "Active now"]}
                rows={data.funnel.map((stage) => [
                  stage.name,
                  stage.count,
                  formatPercent(stage.pct),
                  stage.activeNow,
                ])}
              />
            </>
          ) : (
            <EmptyPanel icon={Funnel} text="The funnel fills in once candidates move through a pipeline." action={pipelineAction} />
          )}
        </Tile>

        <Tile className="gap-5 p-5">
          <CardHead
            icon={Hourglass}
            title="Time to hire"
            subtitle={`Apply to hire for hires ${rangeLower}.`}
          />
          {hasTimeToHire ? (
            <div className="space-y-4">
              <Histogram data={data.timeToHire} />
              <p className="text-xs text-soft-ink">
                {`Median ${formatDays(data.timeToHireStats.medianDays)} · Average ${formatDays(summary.avgTimeToHireDays)} · ${data.timeToHireStats.measured} hires measured`}
              </p>
              <ChartTable
                caption={`Time to hire distribution, hires ${rangeLower}`}
                headers={["Days to hire", "Hires"]}
                rows={data.timeToHire.map((bucket) => [bucket.bucket, bucket.count])}
              />
            </div>
          ) : (
            <EmptyPanel icon={Hourglass} text={`No hires ${rangeLower}. Time to hire appears after the first hire in range.`} action={pipelineAction} />
          )}
        </Tile>
      </motion.section>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.25 }}
      >
        <Tile className="gap-5 p-5">
          <CardHead
            icon={Target}
            title="Source effectiveness"
            subtitle={`Applications received and hires made ${rangeLower}, by source.`}
          />
          {sourceData.length ? (
            <SourceBars sources={sourceData} />
          ) : (
            <EmptyPanel icon={Users} text={`No applications ${rangeLower}. Sources appear once candidates apply.`} action={jobsAction} />
          )}
        </Tile>
      </motion.div>

      <p className="px-1 text-xs text-soft-ink">
        {`${summary.openRoles.toLocaleString()} open roles (current) · ${summary.totalCandidates.toLocaleString()} candidates tracked (all time) · ${applicationsTotal.toLocaleString()} applications and ${hiresLast12.toLocaleString()} hires in the last 12 months.`}
      </p>
    </div>
  );
}
