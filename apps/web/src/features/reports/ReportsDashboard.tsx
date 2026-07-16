"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Tile } from "@/components/dashboard/widgets/primitives";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BriefcaseIcon,
  ChartLineUpDuotoneIcon,
  ClockCountdownDuotoneIcon,
  ClockIcon,
  FunnelDuotoneIcon,
  TargetDuotoneIcon,
  TrendUpIcon,
  UsersIcon,
} from "@/components/ui/icons/phosphor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const RANGE_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

function formatSource(source: string) {
  if (source === "unknown") return "Unknown";
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type IconComponent = React.ComponentType<{ className?: string }>;

function EmptyPanel({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value <= 0 : value >= 0;
  const Icon = positive ? ArrowUpRightIcon : ArrowDownRightIcon;
  const shown = invert ? -value : value;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        positive ? "bg-pine/10 text-pine" : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3" />
      {shown >= 0 ? "+" : ""}
      {shown}%
    </span>
  );
}

function StatCard({
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
      className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(23,23,23,0.04)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        {typeof delta === "number" ? (
          <DeltaBadge value={delta} invert={invertDelta} />
        ) : null}
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
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
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export function ReportsDashboard({ data }: { data: ReportsData }) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const totalApplications = data.applicationsByMonth.reduce((s, p) => s + p.count, 0);
  const last12Hires = data.hiresByMonth.reduce((s, p) => s + p.count, 0);
  const topSource = data.sources[0];
  const { comparison } = data;

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

  const rangeLabel =
    RANGE_OPTIONS.find((o) => Number(o.value) === comparison.rangeDays)?.label ??
    `Last ${comparison.rangeDays} days`;

  const stats = [
    {
      icon: UsersIcon,
      label: "Applications",
      value: comparison.applications.current.toLocaleString(),
      hint: `${data.summary.applications90d.toLocaleString()} in the last 90 days`,
      delta: comparison.applications.deltaPct,
    },
    {
      icon: BriefcaseIcon,
      label: "Hires",
      value: comparison.hires.current.toLocaleString(),
      hint: `${data.summary.hires.toLocaleString()} hires all-time`,
      delta: comparison.hires.deltaPct,
    },
    {
      icon: ClockIcon,
      label: "Avg time to hire",
      value: comparison.avgTimeToHireDays.current > 0 ? `${comparison.avgTimeToHireDays.current}d` : "—",
      hint:
        comparison.avgTimeToHireDays.previous > 0
          ? `${comparison.avgTimeToHireDays.previous}d prior period`
          : "No prior data",
      delta: comparison.avgTimeToHireDays.deltaPct,
      invertDelta: true,
    },
    {
      icon: TrendUpIcon,
      label: "Offer acceptance",
      value: data.summary.offerAcceptRate != null ? `${data.summary.offerAcceptRate}%` : "—",
      hint: topSource ? `${formatSource(topSource.source)} leads source volume` : "No source data yet",
      delta: null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Select
          value={String(comparison.rangeDays)}
          onValueChange={(v) => router.push(`/dashboard/reports?range=${v}`)}
        >
          <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
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
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} index={i} />
        ))}
      </section>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.15 }}
      >
        <Tile className="gap-5 p-5">
          <CardHead icon={ChartLineUpDuotoneIcon} title="Hiring trend" subtitle="Applications received vs. hires made, by month." />
          <TrendChart series={trendSeries} />
        </Tile>
      </motion.div>

      <motion.section
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.2 }}
        className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <Tile className="gap-5 p-5">
          <CardHead icon={FunnelDuotoneIcon} title="Pipeline funnel" subtitle="Stage reach and step-to-step conversion. Hover a stage." />
          {data.funnel[0]?.count ? (
            <FunnelChart stages={data.funnel} />
          ) : (
            <EmptyPanel icon={FunnelDuotoneIcon} text="Funnel data appears once candidates move through stages." />
          )}
        </Tile>

        <Tile className="gap-5 p-5">
          <CardHead icon={ClockCountdownDuotoneIcon} title="Time to hire" subtitle="How long filled roles took, from apply to hire." />
          <Histogram data={data.timeToHire} />
        </Tile>
      </motion.section>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.25 }}
      >
        <Tile className="gap-5 p-5">
          <CardHead icon={TargetDuotoneIcon} title="Source effectiveness" subtitle="Volume and hire conversion by application source." />
          {sourceData.length ? (
            <SourceBars sources={sourceData} />
          ) : (
            <EmptyPanel icon={UsersIcon} text="No applications yet. Sources appear once candidates apply." />
          )}
        </Tile>
      </motion.div>

      <p className="px-1 text-xs text-muted-foreground">
        {`${totalApplications.toLocaleString()} applications · ${last12Hires.toLocaleString()} hires in the last 12 months · ${data.summary.totalCandidates.toLocaleString()} candidates tracked · comparing to ${rangeLabel.toLowerCase()}.`}
      </p>
    </div>
  );
}
