"use client";

/**
 * Reports chart primitives , hand-built, dependency-free SVG.
 *
 * The app ships no charting library, and the rest of the dashboard draws its
 * own SVG, so these match the house style: responsive viewBox, colours from
 * the `--chart-*` design tokens, keyboard-reachable hit targets, and crisp
 * HTML tooltips layered over the vector.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { SourceLogo } from "./brand-logos";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// ── shared helpers ──────────────────────────────────────────────────────────

/**
 * Measure a container's width so SVG charts render at true pixel dimensions
 * instead of scaling a fixed viewBox to fill the column (which magnified text
 * and strokes). Returns a ref to attach and the current width in px.
 */
function useMeasuredWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round a max up to a friendly axis ceiling so gridlines read cleanly. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  if (value <= 10) return Math.ceil(value / 2) * 2;
  return Math.ceil(value / 5) * 5;
}

/**
 * Catmull-Rom → cubic Bezier smoothing. A straight point-to-point join turns
 * a mostly-flat, occasionally-spiky series (typical for monthly hiring
 * counts) into a harsh shark-fin. This keeps the same data but rounds the
 * approach and departure from each point.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const fmt = new Intl.NumberFormat("en");

// ── Trend chart , multi-series area + line with inspector ────────────────────

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

  const [wrapRef, W] = useMeasuredWidth(760);
  const H = 240;
  const padL = 32;
  const padR = 12;
  const padT = 16;
  const padB = 28;
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
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  off ? "text-soft-ink" : "text-near-ink hover:bg-soft-kraft",
                )}
              >
                <span
                  className="size-2.5 rounded-full transition"
                  style={{ backgroundColor: off ? "var(--soft-ink)" : s.color, opacity: off ? 0.4 : 1 }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <span className="text-xs text-soft-ink">{subs[active]}</span>
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block w-full select-none"
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
                stroke="var(--hairline)"
                strokeDasharray={g === 0 ? undefined : "3 6"}
              />
              <text x={padL - 8} y={y(g) + 4} textAnchor="end" className="fill-soft-ink text-[10px] tabular-nums">
                {Math.round(g)}
              </text>
            </g>
          ))}

          {/* active guide */}
          {n > 0 && (
            <line x1={activeX} x2={activeX} y1={padT} y2={H - padB} stroke="var(--soft-ink)" strokeOpacity="0.25" />
          )}

          {visible.map((s) => {
            const coords = s.points.map((p, i) => ({ x: x(i), y: y(p.value) }));
            const line = smoothPath(coords);
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
                <circle cx={x(active)} cy={y(s.points[active]?.value ?? 0)} r={4.5} fill="var(--pure-snow)" stroke={s.color} strokeWidth={2.5} />
              </g>
            );
          })}

          {/* hit columns , keyboard + hover */}
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
              <text key={`lbl-${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-soft-ink text-[10px]">
                {label}
              </text>
            ) : null,
          )}
        </svg>

        {/* tooltip */}
        {n > 0 && (
          <div
            className={cn(
              "pointer-events-none absolute top-0 z-10 rounded-xl border border-hairline bg-pure-snow/95 px-3 py-2 shadow-[var(--shadow-float)] backdrop-blur",
              tipShift,
            )}
            style={{ left: `${(activeX / W) * 100}%` }}
          >
            <p className="mb-1 text-[11px] font-medium text-soft-ink">{subs[active]}</p>
            <div className="space-y-0.5">
              {visible.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-soft-ink">{s.label}</span>
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

// ── Pipeline by stage , where active candidates sit right now ────────────────
//
// `count` is a live snapshot (candidates currently sitting in that stage),
// not a cumulative "reached at least this far" total — a later stage can
// hold more people than an earlier one just because candidates linger there.
// Showing an adjacent-stage "% conversion" on top of that would claim a
// funnel that isn't there (it can read over 100%). So this shows the one
// thing the data actually supports: how the active pipeline is distributed.

export type FunnelDatum = { name: string; count: number; pct: number };

export function FunnelChart({ stages }: { stages: FunnelDatum[] }) {
  const shouldReduceMotion = useReducedMotion();
  const total = stages.reduce((s, st) => s + st.count, 0);
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <ul className="space-y-3">
      {stages.map((stage, i) => (
        <motion.li
          key={stage.name}
          initial={shouldReduceMotion ? false : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT, delay: i * 0.04 }}
          className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3 sm:gap-4"
        >
          <span className="truncate text-sm font-medium text-near-ink">{stage.name}</span>
          <span className="relative h-7 overflow-hidden rounded-lg bg-warm-paper">
            <span
              className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300"
              style={{ width: `${Math.max((stage.count / max) * 100, stage.count > 0 ? 4 : 0)}%`, backgroundColor: "var(--chart-1)" }}
            />
          </span>
          <span className="w-20 shrink-0 text-right text-sm tabular-nums">
            <span className="font-semibold text-near-ink">{fmt.format(stage.count)}</span>
            <span className="text-soft-ink"> · {stage.pct}%</span>
          </span>
        </motion.li>
      ))}
      <li className="flex items-center justify-between border-t border-hairline pt-2 text-xs text-soft-ink">
        <span>Share of applied currently in each stage</span>
        <span className="tabular-nums">{fmt.format(total)} active</span>
      </li>
    </ul>
  );
}

// ── Source bars , volume with hire share + conversion ────────────────────────

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
        <div className="flex rounded-full bg-soft-kraft p-1">
          {(["candidates", "hires", "conversion"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={cn(
                "relative rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors active:scale-[0.97]",
                sort === key ? "text-near-ink" : "text-soft-ink hover:text-near-ink",
              )}
            >
              {sort === key ? (
                <motion.span
                  layoutId="source-sort-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-pure-snow shadow-[var(--shadow-soft)]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              ) : null}
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
            className="grid grid-cols-[minmax(110px,160px)_1fr_auto] items-center gap-3 sm:gap-4"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center text-soft-ink">
                <SourceLogo source={row.source} className="size-4" />
              </span>
              <span className="truncate text-sm font-medium text-near-ink">{row.label}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline justify-between text-[11px] tabular-nums text-soft-ink">
                <span>{fmt.format(row.candidates)} candidates</span>
                <span>{fmt.format(row.hires)} hired</span>
              </span>
              <span className="relative h-5 overflow-hidden rounded-lg bg-warm-paper">
                <span
                  className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300"
                  style={{ width: `${Math.max((row.candidates / maxC) * 100, 4)}%`, backgroundColor: "var(--chart-1)", opacity: 0.18 }}
                />
                <span
                  className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300"
                  style={{ width: `${Math.max((row.hires / maxC) * 100, row.hires > 0 ? 3 : 0)}%`, backgroundColor: "var(--chart-1)" }}
                />
              </span>
            </span>
            <span className="w-12 text-right text-sm font-semibold tabular-nums text-near-ink">{row.conversion}%</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ── Histogram , vertical columns (time-to-hire) ──────────────────────────────

export function Histogram({ data, color = "var(--chart-2)" }: { data: { bucket: string; count: number }[]; color?: string }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-soft-ink">No hires yet</p>
        <p className="text-xs text-soft-ink">Distribution appears once roles are filled.</p>
      </div>
    );
  }

  const summary = `Time to hire distribution. ${data.map((d) => `${d.bucket}: ${d.count}`).join("; ")}.`;

  return (
    <div className="flex h-44 items-end gap-2" role="img" aria-label={summary}>
      {data.map((d) => (
        <div key={d.bucket} className="flex flex-1 flex-col items-center gap-2">
          <span className={cn("text-xs font-semibold tabular-nums", d.count > 0 ? "text-near-ink" : "text-quiet-mist")}>
            {d.count}
          </span>
          <div className="flex w-full flex-1 items-end border-b border-hairline">
            <div
              className="w-full rounded-t-md transition-[height] duration-300"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0, backgroundColor: color }}
            />
          </div>
          <span className="text-[11px] text-soft-ink">{d.bucket}</span>
        </div>
      ))}
    </div>
  );
}
