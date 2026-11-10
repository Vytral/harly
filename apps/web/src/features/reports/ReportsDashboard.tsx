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
  Info,
  LineChart,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";

import { Tile } from "@/components/dashboard/widgets/primitives";
import { FilterPill } from "@/components/ui/FilterPill";
import { ValueSwap } from "@/components/ui/value-swap";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toSafeCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FunnelChart,
  Histogram,
  SourceBars,
  TrendChart,
  type SourceDatum,
  type TrendSeries,
} from "./charts";
import type { ReportsData } from "./data";
import { REPORT_RANGE_DAYS } from "./ranges";
import { monthLabel } from "./window";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Stable bucket ids from metrics.ts, mapped to their label keys. */
const TIME_TO_HIRE_BUCKET_KEYS: Record<string, string> = {
  "0–14d": "upTo14Days",
  "15–30d": "days15To30",
  "31–60d": "days31To60",
  "61–90d": "days61To90",
  "90d+": "over90Days",
};

type Translator = ReturnType<typeof useTranslations>;

/** Range label for the selected period, matching the server's `reportRangeLabel`. */
function formatRangeLabel(t: Translator, days: number) {
  return days === 365
    ? t("rangeLabels.lastTwelveMonths")
    : t("rangeLabels.lastDays", { count: days });
}

function formatSource(t: Translator, source: string) {
  if (source === "unknown") return t("unknownSource");
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDataAsOf(t: Translator, locale: string, generatedAt: string, timeZone: string) {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return t("dataAsOfUnknown");
  const formatted = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
  return t("dataAsOf", { date: formatted, timeZone });
}

function formatDays(t: Translator, value: number | null) {
  return value == null ? t("noData") : t("daysValue", { days: Math.round(value) });
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;

type EmptyPanelAction = { href: Route; label: string };

function EmptyPanel({ icon: Icon, text, action }: { icon: IconComponent; text: string; action?: EmptyPanelAction }) {
  return (
    <div className="m-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-inner)] bg-card-inset px-6 py-10 text-center">
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

/** A delta badge. `null` means there is nothing to compare: show nothing. */
function DeltaBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null) return null;
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
      className="rounded-[var(--radius-inner)] bg-card-inset p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-8 items-center justify-center rounded-[var(--radius-btn)] bg-pure-snow text-soft-ink">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        {delta !== undefined ? <DeltaBadge value={delta} invert={invertDelta} /> : null}
      </div>
      <p className="mt-4 text-xs font-medium text-soft-ink">{label}</p>
      <p className="font-display mt-1 text-[28px] leading-none tabular-nums text-near-ink">
        <ValueSwap value={value} />
      </p>
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
  const t = useTranslations("features.reports.reportsDashboard");
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
        <Icon className="size-4 text-near-ink" strokeWidth={1.8} />
      </span>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">{title}</h2>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("aboutLabel", { title })}
            className="grid size-6 place-items-center rounded-full text-quiet-mist transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            <Info className="size-3.5" strokeWidth={1.8} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {subtitle}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Data for screen readers that mirrors a chart, visually hidden. The wrapper
 * div carries sr-only: on a <table> itself Firefox paints the <caption>
 * outside the clip, on top of the chart header.
 */
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
    <div className="sr-only">
    <table>
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
    </div>
  );
}

export function ReportsDashboard({ data, canViewCandidates = false, canViewJobs = false }: {
  data: ReportsData;
  canViewCandidates?: boolean;
  canViewJobs?: boolean;
}) {
  const t = useTranslations("features.reports.reportsDashboard");
  const tStage = useTranslations("labels.reports.funnelStages");
  const tBucket = useTranslations("labels.reports.timeToHireBuckets");
  const locale = useLocale();
  const pipelineAction: EmptyPanelAction | undefined = canViewCandidates && canViewJobs
    ? { href: "/dashboard/pipeline", label: t("viewPipeline") }
    : canViewCandidates ? { href: "/dashboard/candidates", label: t("viewCandidates") } : undefined;
  const jobsAction: EmptyPanelAction | undefined = canViewJobs
    ? { href: "/dashboard/jobs", label: t("viewJobs") }
    : pipelineAction;
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { summary, comparison, range } = data;
  const rangeLabel = formatRangeLabel(t, range.days);
  const rangeLower = rangeLabel.toLowerCase();
  const rangeOptions = REPORT_RANGE_DAYS.map((days) => ({
    value: String(days),
    label: formatRangeLabel(t, days),
  }));
  const applicationsTotal = data.applicationsByMonth.reduce((s, p) => s + p.count, 0);
  const hiresLast12 = data.hiresByMonth.reduce((s, p) => s + p.count, 0);
  const offersDecided = summary.offers.accepted + summary.offers.declined;
  const hasFunnel = data.funnel.some((s) => s.count > 0);
  const hasTimeToHire = data.timeToHire.some((bucket) => bucket.count > 0);

  const trendSeries: TrendSeries[] = useMemo(
    () => [
      {
        key: "applications",
        label: t("stats.applications"),
        color: "var(--chart-1)",
        points: data.applicationsByMonth.map((p) => ({ label: monthLabel(p.month, locale), sub: p.month, value: p.count })),
      },
      {
        key: "hires",
        label: t("stats.hires"),
        color: "var(--chart-2)",
        points: data.hiresByMonth.map((p) => ({ label: monthLabel(p.month, locale), sub: p.month, value: p.count })),
      },
    ],
    [data.applicationsByMonth, data.hiresByMonth, t, locale],
  );

  const funnelStages = useMemo(
    () => data.funnel.map((stage) => ({ ...stage, name: tStage(stage.kind) })),
    [data.funnel, tStage],
  );

  const timeToHireBuckets = useMemo(
    () =>
      data.timeToHire.map((bucket) => {
        const key = TIME_TO_HIRE_BUCKET_KEYS[bucket.bucket];
        return { ...bucket, bucket: key ? tBucket(key) : bucket.bucket };
      }),
    [data.timeToHire, tBucket],
  );

  const sourceData: SourceDatum[] = useMemo(
    () =>
      data.sources.map((s) => ({
        source: s.source,
        label: formatSource(t, s.source),
        candidates: s.applications,
        hires: s.hires,
        conversion: s.conversion,
      })),
    [data.sources, t],
  );

  function exportReportCsv() {
    const scope = `${rangeLabel} (${data.timeZone})`;
    const rows: string[][] = [
      [t("csv.title")],
      [t("csv.range"), rangeLabel],
      [t("csv.timeZone"), data.timeZone],
      [t("csv.generatedAt"), data.generatedAt],
      [],
      [t("csv.metric"), t("csv.scope"), t("csv.value")],
      [t("csv.applicationsReceived"), scope, String(comparison.applications.current)],
      [t("csv.applicationsReceived"), t("csv.previousPeriod"), String(comparison.applications.previous)],
      [t("csv.hires"), scope, String(comparison.hires.current)],
      [t("csv.hires"), t("csv.previousPeriod"), String(comparison.hires.previous)],
      [t("csv.avgTimeToHireDays"), scope, data.timeToHireStats.measured > 0 ? String(comparison.avgTimeToHireDays.current) : ""],
      [t("csv.medianTimeToHireDays"), scope, data.timeToHireStats.medianDays == null ? "" : String(data.timeToHireStats.medianDays)],
      [t("csv.offerAcceptance"), scope, summary.offerAcceptRate == null ? "" : String(summary.offerAcceptRate)],
      [t("csv.offersAccepted"), scope, String(summary.offers.accepted)],
      [t("csv.offersDeclined"), scope, String(summary.offers.declined)],
      [t("csv.openRoles"), t("csv.current"), String(summary.openRoles)],
      [t("csv.candidatesTracked"), t("csv.allTime"), String(summary.totalCandidates)],
      [],
      [t("csv.funnelStage"), t("csv.reachedScope", { scope }), t("csv.shareOfApplications"), t("csv.activeNow")],
      ...funnelStages.map((stage) => [
        stage.name,
        String(stage.count),
        stage.pct == null ? "" : String(stage.pct),
        String(stage.activeNow),
      ]),
      [],
      [t("csv.timeToHireDays"), t("csv.hiresScope", { scope })],
      ...timeToHireBuckets.map((bucket) => [bucket.bucket, String(bucket.count)]),
      [],
      [t("csv.source"), t("csv.applicationsScope", { scope }), t("csv.hiresScope", { scope }), t("csv.conversion")],
      ...data.sources.map((source) => [
        formatSource(t, source.source),
        String(source.applications),
        String(source.hires),
        source.conversion == null ? "" : String(source.conversion),
      ]),
      [],
      [t("csv.applicationsByMonth"), t("csv.lastTwelveMonthsZoneLocal"), t("csv.count")],
      ...data.applicationsByMonth.map((point) => [t("csv.applications"), point.month, String(point.count)]),
      [],
      [t("csv.hiresByMonth"), t("csv.lastTwelveMonthsZoneLocal"), t("csv.count")],
      ...data.hiresByMonth.map((point) => [t("csv.hires"), point.month, String(point.count)]),
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
      label: t("stats.applications"),
      value: comparison.applications.current.toLocaleString(locale),
      hint: t("stats.receivedHint", { range: rangeLower }),
      delta: comparison.applications.deltaPct,
    },
    {
      icon: Briefcase,
      label: t("stats.hires"),
      value: comparison.hires.current.toLocaleString(locale),
      hint: t("stats.hiredHint", { range: rangeLower }),
      delta: comparison.hires.deltaPct,
    },
    {
      icon: Clock,
      label: t("stats.avgTimeToHire"),
      value: formatDays(t, summary.avgTimeToHireDays),
      hint: summary.avgTimeToHireDays == null
        ? t("stats.noHiresHint", { range: rangeLower })
        : t("stats.applyToHireHint", { range: rangeLower }),
      delta: comparison.avgTimeToHireDays.deltaPct,
      invertDelta: true,
    },
    {
      icon: TrendingUp,
      label: t("stats.offerAcceptance"),
      value: formatPercent(summary.offerAcceptRate),
      hint: offersDecided > 0
        ? t("stats.offersDecidedHint", {
          accepted: summary.offers.accepted,
          decided: offersDecided,
          range: rangeLower,
        })
        : t("stats.noOffersDecidedHint", { range: rangeLower }),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight text-near-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-soft-ink">
            {t("subtitle", { range: rangeLower })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filtersLabel")}>
          <FilterPill
            label={t("period")}
            value={String(comparison.rangeDays)}
            onChange={(v) => router.push(`/dashboard/reports?range=${v}`)}
            options={rangeOptions.map((o) => o.value)}
            labelMap={Object.fromEntries(rangeOptions.map((o) => [o.value, o.label]))}
            allValue={String(comparison.rangeDays)}
          />
          <Button variant="outline" onClick={exportReportCsv}>
            <Download className="size-4" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      <Card className="flex-row items-center gap-2.5 py-3.5 px-5">
        <Info className="size-4 shrink-0 text-quiet-mist" strokeWidth={1.8} />
        <p className="text-[13px] text-soft-ink">
          <span className="font-medium text-near-ink">{t("displayingResults", { range: rangeLower })}</span>
          {` · ${formatDataAsOf(t, locale, data.generatedAt, data.timeZone)}`}
        </p>
      </Card>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <StatCell key={s.label} {...s} index={i} />
        ))}
      </Card>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.15 }}
      >
        <Tile className="gap-5 p-5">
          <CardHead
            icon={LineChart}
            title={t("trend.title")}
            subtitle={t("trend.subtitle")}
          />
          {applicationsTotal > 0 || hiresLast12 > 0 ? (
            <>
              <TrendChart series={trendSeries} />
              <ChartTable
                caption={t("trend.caption")}
                headers={[t("table.month"), t("table.applications"), t("table.hires")]}
                rows={data.applicationsByMonth.map((point, i) => [
                  point.month,
                  point.count,
                  data.hiresByMonth[i]?.count ?? 0,
                ])}
              />
            </>
          ) : (
            <EmptyPanel icon={LineChart} text={t("trend.empty")} action={jobsAction} />
          )}
        </Tile>
      </motion.div>

      <motion.section
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.2 }}
        className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <Tile className="gap-5 p-5">
          <CardHead
            icon={Funnel}
            title={t("funnel.title")}
            subtitle={t("funnel.subtitle", { range: rangeLower })}
          />
          {hasFunnel ? (
            <>
              <FunnelChart stages={funnelStages} />
              <ChartTable
                caption={t("funnel.caption", { range: rangeLower })}
                headers={[
                  t("table.stage"),
                  t("table.reached"),
                  t("table.shareOfApplications"),
                  t("table.activeNow"),
                ]}
                rows={funnelStages.map((stage) => [
                  stage.name,
                  stage.count,
                  formatPercent(stage.pct),
                  stage.activeNow,
                ])}
              />
            </>
          ) : (
            <EmptyPanel icon={Funnel} text={t("funnel.empty")} action={pipelineAction} />
          )}
        </Tile>

        <Tile className="gap-5 p-5">
          <CardHead
            icon={Hourglass}
            title={t("timeToHire.title")}
            subtitle={t("timeToHire.subtitle", { range: rangeLower })}
          />
          {hasTimeToHire ? (
            <div className="space-y-4">
              <Histogram data={timeToHireBuckets} />
              <p className="text-xs text-soft-ink">
                {t("timeToHire.stats", {
                  median: formatDays(t, data.timeToHireStats.medianDays),
                  average: formatDays(t, summary.avgTimeToHireDays),
                  measured: data.timeToHireStats.measured,
                })}
              </p>
              <ChartTable
                caption={t("timeToHire.caption", { range: rangeLower })}
                headers={[t("table.daysToHire"), t("table.hires")]}
                rows={timeToHireBuckets.map((bucket) => [bucket.bucket, bucket.count])}
              />
            </div>
          ) : (
            <EmptyPanel icon={Hourglass} text={t("timeToHire.empty", { range: rangeLower })} action={pipelineAction} />
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
            title={t("sources.title")}
            subtitle={t("sources.subtitle", { range: rangeLower })}
          />
          {sourceData.length ? (
            <SourceBars sources={sourceData} />
          ) : (
            <EmptyPanel icon={Users} text={t("sources.empty", { range: rangeLower })} action={jobsAction} />
          )}
        </Tile>
      </motion.div>

      <p className="px-1 text-xs text-soft-ink">
        {t("footer", {
          openRoles: summary.openRoles.toLocaleString(locale),
          candidates: summary.totalCandidates.toLocaleString(locale),
          applications: applicationsTotal.toLocaleString(locale),
          hires: hiresLast12.toLocaleString(locale),
        })}
      </p>
    </div>
  );
}
