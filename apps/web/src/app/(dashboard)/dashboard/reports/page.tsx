import {
  BarChart3,
  Briefcase,
  Clock,
  GitBranch,
  Inbox,
  TrendingUp,
  Users,
} from "lucide-react";

import { getReportsData } from "@/features/reports/data";
import { PerformanceChart } from "@/components/dashboard/widgets/PerformanceChart";
import {
  EmptyHint,
  Tile,
  TileHeader,
} from "@/components/dashboard/widgets/primitives";

export const dynamic = "force-dynamic";

// Funnel lane colours — same ramp the pipeline overview uses (Applied → Hired).
const LANE_COLORS = ["#1f6f53", "#4f9e7f", "#b4540a", "#7a5ea8", "#9b968a"];

export default async function ReportsPage() {
  const { summary, applicationsByMonth, funnel, sources } =
    await getReportsData();

  const totalApplications = applicationsByMonth.reduce(
    (sum, m) => sum + m.count,
    0,
  );
  const funnelTop = funnel[0]?.count ?? 0;

  const kpis = [
    { icon: Briefcase, label: "Open roles", value: summary.openRoles.toString() },
    {
      icon: Users,
      label: "Candidates",
      value: summary.totalCandidates.toLocaleString(),
      hint: `${summary.applications90d} applied in 90 days`,
    },
    {
      icon: Clock,
      label: "Avg time to hire",
      value:
        summary.avgTimeToHireDays != null ? `${summary.avgTimeToHireDays}d` : "—",
      hint: `${summary.hires} hired all-time`,
    },
    {
      icon: TrendingUp,
      label: "Offer accept rate",
      value:
        summary.offerAcceptRate != null ? `${summary.offerAcceptRate}%` : "—",
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hiring funnel, velocity, and source effectiveness across your
            workspace.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Last 12 months</p>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl border border-border/60 bg-background/40 p-4"
            >
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5" strokeWidth={1.8} />
                {kpi.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                {kpi.value}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {kpi.hint ?? " "}
              </p>
            </div>
          );
        })}
      </div>

      {/* Trend + funnel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Tile className="lg:col-span-2">
          <TileHeader icon={BarChart3} title="Applications over time" />
          <div className="flex items-center justify-between px-5 pt-3">
            <p className="text-xs text-muted-foreground">
              Applications received per month
            </p>
            <p className="text-sm font-medium tabular-nums">
              {totalApplications.toLocaleString()} total
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center px-3 pb-4 pt-1">
            <PerformanceChart
              points={applicationsByMonth.map((m) => ({
                label: m.label,
                value: m.count,
              }))}
            />
          </div>
        </Tile>

        <Tile>
          <TileHeader icon={GitBranch} title="Pipeline funnel" />
          <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-3">
            {/* Segmented bar */}
            <div className="flex h-2.5 w-full gap-1 overflow-hidden">
              {funnelTop > 0 ? (
                funnel.map((stage, i) =>
                  stage.count > 0 ? (
                    <div
                      key={stage.name}
                      className="h-full rounded-full"
                      style={{
                        width: `${(stage.count / funnelTop) * 100}%`,
                        backgroundColor: LANE_COLORS[i % LANE_COLORS.length],
                      }}
                    />
                  ) : null,
                )
              ) : (
                <div className="h-full w-full rounded-full bg-muted" />
              )}
            </div>

            {/* Stage legend */}
            <div className="space-y-2.5">
              {funnel.map((stage, i) => (
                <div
                  key={stage.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: LANE_COLORS[i % LANE_COLORS.length],
                      }}
                    />
                    <span className="truncate text-sm">{stage.name}</span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {stage.count}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {stage.pct}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Tile>
      </div>

      {/* Source effectiveness */}
      <Tile>
        <TileHeader icon={Inbox} title="Source effectiveness" />
        {sources.length === 0 ? (
          <EmptyHint
            icon={Users}
            text="No applications yet — sources appear once candidates apply."
          />
        ) : (
          <div className="px-5 pb-4 pt-3">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b pb-2 text-xs font-medium text-muted-foreground">
              <span>Source</span>
              <span className="text-right">Candidates</span>
              <span className="text-right">Hires</span>
              <span className="text-right">Conversion</span>
            </div>
            <div className="divide-y divide-border/60">
              {sources.map((row) => (
                <div
                  key={row.source}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 py-3 text-sm"
                >
                  <span className="truncate font-medium capitalize">
                    {row.source.replace(/_/g, " ")}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {row.candidates}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {row.hires}
                  </span>
                  <span className="text-right tabular-nums font-medium">
                    {row.conversion}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Tile>
    </div>
  );
}
