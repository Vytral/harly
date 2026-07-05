"use client";

/**
 * Reports chart primitives — hand-built, dependency-free SVG.
 *
 * The app ships no charting library, and the rest of the dashboard draws its
 * own SVG, so these match the house style: responsive viewBox, colours from
 * the `--chart-*` design tokens, keyboard-reachable hit targets, and crisp
 * HTML tooltips layered over the vector.
 */

import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// ── shared helpers ──────────────────────────────────────────────────────────

/** Round a max up to a friendly axis ceiling so gridlines read cleanly. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  if (value <= 10) return Math.ceil(value / 2) * 2;
  return Math.ceil(value / 5) * 5;
}

const fmt = new Intl.NumberFormat("en");

// ── Trend chart — multi-series area + line with inspector ────────────────────

export type TrendPoint = { label: string; sub?: string; value: number };
export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  points: TrendPoint[];
};

export function TrendChart({ series }: { series: TrendSeries[] }) {
  const gradientId = useId();
  const shouldReduceMotion = useReducedMotion();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const subs = series[0]?.points.map((p) => p.sub ?? p.label) ?? [];
  const [active, setActive] = useState(Math.max(labels.length - 1, 0));

  const visible = series.filter((s) => !hidden.has(s.key));
  const max = niceMax(
    Math.max(0, ...visible.flatMap((s) => s.points.map((p) => p.value))),
  );

  const W = 760;
  const H = 240;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = labels.length;
  const x = (i: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH * (1 - v / max);

  const grid = [0, max / 2, max];
  const activeX = x(active);
  // Keep the tooltip inside the card at the first/last point instead of bleeding out.
  const tipShift = active <= 0 ? "translate-x-0" : active >= n - 1 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  setHidden((cur) => {
                    const next = new Set(cur);
                    if (next.has(s.key)) next.delete(s.key);
                    else if (next.size < series.length - 1) next.add(s.key);
                    return next;
                  })
                }
                aria-pressed={!off}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition",
                  off ? "text-muted-foreground/60" : "text-foreground hover:bg-muted/60",
                )}
              >
                <span
                  className="size-2.5 rounded-full transition"
                  style={{ backgroundColor: off ? "var(--muted-foreground)" : s.color, opacity: off ? 0.4 : 1 }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <span className="text-xs text-muted-foreground">{subs[active]}</span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label="Hiring trend over time"
          onMouseLeave={() => setActive(Math.max(n - 1, 0))}
        >
          <defs>
            {visible.map((s) => (
              <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {grid.map((g) => (
            <g key={g}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(g)}
                y2={y(g)}
                stroke="var(--border)"
                strokeDasharray={g === 0 ? undefined : "3 6"}
              />
              <text x={padL - 8} y={y(g) + 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {Math.round(g)}
              </text>
            </g>
          ))}

          {/* active guide */}
          {n > 0 && (
            <line x1={activeX} x2={activeX} y1={padT} y2={H - padB} stroke="var(--ink-soft)" strokeOpacity="0.25" />
          )}

          {visible.map((s) => {
            const coords = s.points.map((p, i) => ({ x: x(i), y: y(p.value) }));
            const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
            const area = coords.length
              ? `${line} L ${coords[coords.length - 1].x} ${H - padB} L ${coords[0].x} ${H - padB} Z`
              : "";
            return (
              <g key={s.key}>
                <motion.path
                  d={area}
                  fill={`url(#${gradientId}-${s.key})`}
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                />
                <motion.path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={shouldReduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.7, ease: EASE_OUT }}
                />
                <circle cx={x(active)} cy={y(s.points[active]?.value ?? 0)} r={4.5} fill="var(--card)" stroke={s.color} strokeWidth={2.5} />
              </g>
            );
          })}

          {/* hit columns — keyboard + hover */}
          {labels.map((label, i) => (
            <rect
              key={`${label}-${i}`}
              x={n <= 1 ? padL : x(i) - innerW / (2 * Math.max(n - 1, 1))}
              y={padT}
              width={n <= 1 ? innerW : innerW / Math.max(n - 1, 1)}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${subs[i]}: ${visible.map((s) => `${s.label} ${s.points[i]?.value ?? 0}`).join(", ")}`}
              className="cursor-pointer outline-none focus-visible:stroke-primary focus-visible:[stroke-width:2px]"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            />
          ))}

          {labels.map((label, i) =>
            i % 2 === 0 || i === n - 1 ? (
              <text key={`lbl-${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {label}
              </text>
            ) : null,
          )}
        </svg>

        {/* tooltip */}
        {n > 0 && (
          <div
            className={cn(
              "pointer-events-none absolute top-0 z-10 rounded-xl border border-border/70 bg-popover/95 px-3 py-2 shadow-md backdrop-blur",
              tipShift,
            )}
            style={{ left: `${(activeX / W) * 100}%` }}
          >
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">{subs[active]}</p>
            <div className="space-y-0.5">
              {visible.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">{s.points[active]?.value ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Funnel chart — vertical, with stage-to-stage conversion ──────────────────

export type FunnelDatum = { name: string; count: number; pct: number };

export function FunnelChart({ stages }: { stages: FunnelDatum[] }) {
  const shouldReduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const top = stages[0]?.count ?? 0;
  const W = 360;
  const bandH = 54;
  const gap = 10;
  const H = stages.length * bandH + (stages.length - 1) * gap;
  const minW = 40;
  const widthOf = (count: number) =>
    top > 0 ? Math.max((count / top) * W, minW) : minW;

  const sel = stages[selected];
  const prev = selected > 0 ? stages[selected - 1] : null;
  const stepConv =
    prev && prev.count > 0 ? Math.round((sel.count / prev.count) * 100) : null;

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Hiring funnel by stage">
        {stages.map((stage, i) => {
          const wTop = widthOf(stage.count);
          const wBottom = widthOf(stages[i + 1]?.count ?? stage.count);
          const top0 = i * (bandH + gap);
          const x0 = (W - wTop) / 2;
          const x1 = (W + wTop) / 2;
          const xb0 = (W - wBottom) / 2;
          const xb1 = (W + wBottom) / 2;
          const isLast = i === stages.length - 1;
          const path = isLast
            ? `M ${x0} ${top0} L ${x1} ${top0} L ${x1} ${top0 + bandH} L ${x0} ${top0 + bandH} Z`
            : `M ${x0} ${top0} L ${x1} ${top0} L ${xb1} ${top0 + bandH} L ${xb0} ${top0 + bandH} Z`;
          const isSel = i === selected;
          return (
            <motion.g
              key={stage.name}
              tabIndex={0}
              role="button"
              aria-label={`${stage.name}: ${stage.count} (${stage.pct}% of top)`}
              className="cursor-pointer outline-none focus-visible:[&>path]:stroke-primary focus-visible:[&>path]:[stroke-width:3px]"
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => setSelected(i)}
              initial={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT, delay: i * 0.06 }}
            >
              <path
                d={path}
                fill="var(--chart-1)"
                fillOpacity={isSel ? 1 : 0.9}
                stroke={isSel ? "var(--chart-1)" : "transparent"}
                strokeWidth={2}
                className="transition-[fill-opacity]"
              />
              <text x={W / 2} y={top0 + bandH / 2 - 3} textAnchor="middle" className="fill-[var(--primary-foreground)] text-[13px] font-semibold">
                {stage.name}
              </text>
              <text x={W / 2} y={top0 + bandH / 2 + 13} textAnchor="middle" className="fill-[var(--primary-foreground)] text-[11px] tabular-nums opacity-90">
                {fmt.format(stage.count)} · {stage.pct}%
              </text>
            </motion.g>
          );
        })}
      </svg>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
        <Stat label="Stage" value={sel?.name ?? "—"} />
        <Stat label="Reached" value={`${sel?.pct ?? 0}%`} />
        <Stat label="Step conversion" value={stepConv != null ? `${stepConv}%` : "Top"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ── Source bars — volume with hire share + conversion ────────────────────────

export type SourceDatum = {
  source: string;
  label: string;
  candidates: number;
  hires: number;
  conversion: number;
};

export function SourceBars({ sources }: { sources: SourceDatum[] }) {
  const shouldReduceMotion = useReducedMotion();
  const [sort, setSort] = useState<"candidates" | "hires" | "conversion">("candidates");
  const sorted = useMemo(
    () => [...sources].sort((a, b) => b[sort] - a[sort]),
    [sort, sources],
  );
  const maxC = Math.max(1, ...sources.map((s) => s.candidates));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex rounded-full bg-muted p-1">
          {(["candidates", "hires", "conversion"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition",
                sort === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-3">
        {sorted.map((row, i) => (
          <motion.li
            key={row.source}
            layout={!shouldReduceMotion}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: i * 0.04 }}
            className="grid grid-cols-[minmax(96px,150px)_1fr_auto] items-center gap-4"
          >
            <span className="truncate text-sm font-medium">{row.label}</span>
            <span className="relative h-7 overflow-hidden rounded-lg bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300"
                style={{ width: `${Math.max((row.candidates / maxC) * 100, 4)}%`, backgroundColor: "var(--chart-1)", opacity: 0.18 }}
              />
              <span
                className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300"
                style={{ width: `${Math.max((row.hires / maxC) * 100, row.hires > 0 ? 3 : 0)}%`, backgroundColor: "var(--chart-1)" }}
              />
              <span className="absolute inset-y-0 left-2.5 flex items-center text-[11px] font-medium tabular-nums text-foreground/80">
                {row.candidates} cand · {row.hires} hired
              </span>
            </span>
            <span className="w-12 text-right text-sm font-semibold tabular-nums">{row.conversion}%</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ── Histogram — vertical columns (time-to-hire) ──────────────────────────────

export function Histogram({ data, color = "var(--chart-2)" }: { data: { bucket: string; count: number }[]; color?: string }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">No hires yet</p>
        <p className="text-xs text-muted-foreground/70">Distribution appears once roles are filled.</p>
      </div>
    );
  }

  const summary = `Time to hire distribution. ${data.map((d) => `${d.bucket}: ${d.count}`).join("; ")}.`;

  return (
    <div className="flex h-44 items-end gap-2" role="img" aria-label={summary}>
      {data.map((d) => (
        <div key={d.bucket} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-semibold tabular-nums">{d.count}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md transition-[height] duration-300"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0, backgroundColor: color }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">{d.bucket}</span>
        </div>
      ))}
    </div>
  );
}
