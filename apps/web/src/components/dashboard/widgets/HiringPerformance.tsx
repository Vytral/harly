"use client";

import { useState } from "react";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HiringPerformance as PerfData } from "@/features/dashboard/widgets";
import { cn } from "@/lib/utils";
import { Tile } from "./primitives";
import { PerformanceChart } from "./PerformanceChart";

type ChartMetric = "applications" | "interviews" | "hires";

const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "applications", label: "Applications" },
  { key: "interviews", label: "Interviews" },
  { key: "hires", label: "Hires" },
];

export function HiringPerformance({
  data,
  className,
}: {
  data: PerfData;
  className?: string;
}) {
  const [metric, setMetric] = useState<ChartMetric>("applications");

  const kpis = [
    { label: "Applications", ...data.metrics.applications },
    { label: "Interviews", ...data.metrics.interviews },
    { label: "Hires", ...data.metrics.hires },
    { label: "Offer acceptance", ...data.metrics.offerAcceptance },
  ];

  // A brand-new workspace has nothing to chart. Show quiet dashes and one line
  // of explanation instead of a flat zero line and "+0%" deltas.
  const empty =
    !data.metrics.applications.value &&
    !data.metrics.interviews.value &&
    !data.metrics.hires.value;

  return (
    <Tile className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
            <BarChart3 className="size-4" strokeWidth={1.8} />
          </span>
          Hiring performance
        </h2>
        <div className="flex items-center gap-2">
          {empty ? null : (
            <Select
              value={metric}
              onValueChange={(v) => setMetric(v as ChartMetric)}
            >
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_METRICS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-5 px-5 pb-5 pt-4 2xl:grid-cols-[minmax(260px,0.9fr)_1.3fr]">
        <div className="grid grid-cols-2 gap-3">
          {kpis.map((kpi) => {
            // A null value or delta means "no data" (for example, no offers were
            // decided), so it renders as a dash rather than a misleading zero.
            const delta = empty ? null : kpi.deltaPct;
            const hasDelta = delta != null;
            const up = delta != null && delta >= 0;
            return (
              <div
                key={kpi.label}
                className="rounded-[var(--radius-inner)] bg-card-inset p-4"
              >
                <p className="truncate text-[12.5px] font-medium text-soft-ink">
                  {kpi.label}
                </p>
                <p className="font-display mt-1.5 text-[28px] leading-none tabular-nums text-near-ink">
                  {empty || kpi.value == null
                    ? "—"
                    : kpi.isRate
                      ? `${kpi.value}%`
                      : kpi.value}
                </p>
                <p
                  className={cn(
                    "mt-1 flex items-center gap-1 text-xs font-medium",
                    !hasDelta
                      ? "text-soft-ink"
                      : up
                        ? "text-success-olive"
                        : "text-danger-rust",
                  )}
                >
                  {hasDelta ? (
                    up ? (
                      <TrendingUp className="size-3.5" strokeWidth={1.8} />
                    ) : (
                      <TrendingDown className="size-3.5" strokeWidth={1.8} />
                    )
                  ) : null}
                  {hasDelta ? (
                    <>
                      {up ? "+" : ""}
                      {kpi.deltaPct}
                      {kpi.isRate ? "pp" : "%"}
                    </>
                  ) : (
                    "—"
                  )}
                  {empty ? null : (
                    <span className="font-normal text-soft-ink">
                      vs previous 14 days
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex min-w-0 items-center">
          {empty ? (
            <div className="flex min-h-[184px] w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-inner)] bg-warm-paper px-6 py-8 text-center">
              <BarChart3 className="size-5 text-quiet-mist" strokeWidth={1.6} />
              <p className="text-[14px] font-medium text-near-ink">
                Trends appear with your first applications
              </p>
              <p className="max-w-[34ch] text-pretty text-[13px] text-soft-ink">
                Once candidates apply, you will see applications, interviews and
                hires over the last 14 days.
              </p>
            </div>
          ) : (
            <PerformanceChart points={data.series[metric]} />
          )}
        </div>
      </div>
    </Tile>
  );
}
