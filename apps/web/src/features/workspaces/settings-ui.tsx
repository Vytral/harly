import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the settings surface so every section reads the
 * same: a duotone feature tile + title + description header, status pills, and
 * a divided "cockpit" stat strip. Keeps each section card consistent without a
 * per-file re-implementation.
 */

type IconType = React.ComponentType<{ className?: string }>;

export function SectionHeader({
  icon: Icon,
  title,
  description,
  badge,
  action,
  className,
}: {
  icon: IconType;
  title: ReactNode;
  description: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
          <Icon className="size-6" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {badge}
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

const pillTone = {
  on: "bg-sage text-sage-ink",
  off: "bg-muted text-muted-foreground",
  warn: "bg-clay/10 text-clay",
  neutral: "border bg-card text-muted-foreground",
} as const;

const dotTone = {
  on: "bg-pine",
  off: "bg-muted-foreground/50",
  warn: "bg-clay",
  neutral: "bg-muted-foreground/50",
} as const;

export type PillTone = keyof typeof pillTone;

export function StatusPill({
  tone = "neutral",
  dot = true,
  children,
  className,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        pillTone[tone],
        className,
      )}
    >
      {dot ? (
        <span className={cn("size-1.5 rounded-full", dotTone[tone])} />
      ) : null}
      {children}
    </span>
  );
}

/** One cell of a divided horizontal stat strip (cockpit row). */
export function StatCell({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex min-h-6 items-center gap-2 text-sm font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

/** A small brand/feature tile , square, bordered, holds a logo or duotone icon. */
export function BrandTile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card",
        className,
      )}
    >
      {children}
    </span>
  );
}
