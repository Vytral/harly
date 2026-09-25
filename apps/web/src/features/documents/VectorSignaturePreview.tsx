"use client";

import { useEffect, useState } from "react";

import { rebuildVectorMark, type VectorMark } from "./signature-vector";

type Props = {
  d: string | null;
  areContours: boolean;
  viewBox?: string;
  strokeWidth?: number;
  className?: string;
};

export function VectorSignaturePreview({ d, areContours, viewBox, strokeWidth = 0, className }: Props) {
  if (!d) return null;
  return (
    <div className={className ?? "rounded-lg border bg-white p-2"} aria-label="Vector signature preview">
      <svg viewBox={viewBox || "0 0 1 1"} preserveAspectRatio="xMidYMid meet" className="h-20 w-full" role="img">
        <path
          d={d}
          fill={areContours ? "#171717" : "none"}
          stroke={areContours ? "none" : "#171717"}
          strokeWidth={areContours ? undefined : strokeWidth || undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function SavedVectorThumb({ vectorData }: { vectorData: string }) {
  const [mark, setMark] = useState<VectorMark | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void rebuildVectorMark(vectorData)
      .then((next) => {
        if (cancelled) return;
        if (!next) setFailed(true);
        else setMark(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vectorData]);

  if (failed) {
    return <span className="px-2 text-center text-[11px] text-muted-foreground">Unreadable vector</span>;
  }
  if (!mark) {
    return <span className="h-10 w-3/4 animate-pulse rounded bg-muted" />;
  }
  return (
    <svg viewBox={mark.viewBox} preserveAspectRatio="xMidYMid meet" className="max-h-full max-w-full" role="img" aria-label="Saved vector signature">
      <path
        d={mark.outlinePath}
        fill={mark.areContours ? "#171717" : "none"}
        stroke={mark.areContours ? "none" : "#171717"}
        strokeWidth={mark.areContours ? undefined : mark.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
