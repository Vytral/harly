"use client";

import { useEffect, useRef, useState } from "react";

type Point = { label: string; value: number };

/** Lightweight, dependency-free smooth area+line chart sized to its container. */
export function PerformanceChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const H = 184;
  const padL = 28;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = H - padT - padB;
  const baseY = padT + innerH;

  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, 0);
  const niceMax = maxV <= 4 ? 4 : Math.ceil(maxV / 5) * 5;
  const n = points.length;

  const x = (i: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH * (1 - v / niceMax);

  const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = buildSmoothPath(pts);
  const area = pts.length
    ? `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`
    : "";
  const gridVals = [0, niceMax / 2, niceMax];

  return (
    <div ref={ref} className="w-full text-primary">
      <svg width={width} height={H} role="img" aria-label="Hiring trend">
        <defs>
          <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridVals.map((gv) => (
          <g key={gv}>
            <line
              x1={padL}
              y1={y(gv)}
              x2={width - padR}
              y2={y(gv)}
              stroke="var(--border)"
            />
            <text
              x={padL - 8}
              y={y(gv) + 3}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize={10}
            >
              {Math.round(gv)}
            </text>
          </g>
        ))}

        {area ? <path d={area} fill="url(#perf-fill)" /> : null}
        {line ? (
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 3.5 : 2.4}
            fill="var(--card)"
            stroke="currentColor"
            strokeWidth={2}
          />
        ))}

        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={10}
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** Catmull-Rom → cubic Bézier for an organic but non-overshooting curve. */
function buildSmoothPath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
