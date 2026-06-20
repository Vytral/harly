"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Clock,
  GitBranch,
  Inbox,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { EmptyHint, Tile } from "@/components/dashboard/widgets/primitives";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import {
  FunnelChart,
  Histogram,
  SourceBars,
  TrendChart,
  type SourceDatum,
  type TrendSeries,
} from "./charts";
import type { ReportsData } from "./data";

function formatSource(source: string) {
  if (source === "unknown") return "Unknown";
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Month-over-month delta from a trailing series, or null when undefined. */
function momDelta(points: { count: number }[]): number | null {
  const last = points[points.length - 1]?.count ?? 0;
  const prev = points[points.length - 2]?.count ?? 0;
  if (prev <= 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        positive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3" strokeWidth={2} />
      {positive ? "+" : ""}
      {value}%
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(23,23,23,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        {typeof delta === "number" ? <DeltaBadge value={delta} /> : null}
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function CardHead({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function ReportsDashboard({ data }: { data: ReportsData }) {
  const totalApplications = data.applicationsByMonth.reduce((s, p) => s + p.count, 0);
  const last12Hires = data.hiresByMonth.reduce((s, p) => s + p.count, 0);
  const topSource = data.sources[0];

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
    () => data.sources.map((s) => ({ ...s, label: formatSource(s.source) })),
    [data.sources],
  );

  const stats = [
    {
      icon: Users,
      label: "Applications",
      value: totalApplications.toLocaleString(),
      hint: `${data.summary.applications90d.toLocaleString()} in the last 90 days`,
      delta: momDelta(data.applicationsByMonth),
    },
    {
      icon: Briefcase,
      label: "Open roles",
      value: data.summary.openRoles.toLocaleString(),
      hint: "Currently published jobs",
      delta: null,
    },
    {
      icon: Clock,
      label: "Avg time to hire",
      value: data.summary.avgTimeToHireDays != null ? `${data.summary.avgTimeToHireDays}d` : "—",
      hint: `${data.summary.hires.toLocaleString()} hires all-time`,
      delta: null,
    },
    {
      icon: TrendingUp,
      label: "Offer acceptance",
      value: data.summary.offerAcceptRate != null ? `${data.summary.offerAcceptRate}%` : "—",
      hint: topSource ? `${formatSource(topSource.source)} leads source volume` : "No source data yet",
      delta: null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recruiter analytics"
        title="Reports"
        description="Hiring momentum, funnel health, and source quality — read straight from real workspace activity."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.8} />
            Last 12 months
          </span>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <Tile className="gap-5 p-5">
        <CardHead icon={BarChart3} title="Hiring trend" subtitle="Applications received vs. hires made, by month." />
        <TrendChart series={trendSeries} />
      </Tile>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tile className="gap-5 p-5">
          <CardHead icon={GitBranch} title="Pipeline funnel" subtitle="Stage reach and step-to-step conversion. Hover a stage." />
          {data.funnel[0]?.count ? (
            <FunnelChart stages={data.funnel} />
          ) : (
            <EmptyHint icon={GitBranch} text="Funnel data appears once candidates move through stages." />
          )}
        </Tile>

        <Tile className="gap-5 p-5">
          <CardHead icon={Clock} title="Time to hire" subtitle="How long filled roles took, from apply to hire." />
          <Histogram data={data.timeToHire} />
        </Tile>
      </section>

      <Tile className="gap-5 p-5">
        <CardHead icon={Inbox} title="Source effectiveness" subtitle="Volume and hire conversion by application source." />
        {sourceData.length ? (
          <SourceBars sources={sourceData} />
        ) : (
          <EmptyHint icon={Users} text="No applications yet. Sources appear once candidates apply." />
        )}
      </Tile>

      <p className="px-1 text-xs text-muted-foreground/70">
        {`${totalApplications.toLocaleString()} applications · ${last12Hires.toLocaleString()} hires in the last 12 months · ${data.summary.totalCandidates.toLocaleString()} candidates tracked.`}
      </p>
    </div>
  );
}
