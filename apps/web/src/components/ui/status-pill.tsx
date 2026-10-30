import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

/**
 * The one status pill. State without drama: a fully rounded chip whose meaning
 * is carried by its text first and its tone second.
 *
 * Tones map to semantic tokens only, never raw palette classes:
 * - `neutral`  pending, unknown, not started
 * - `info`     in progress, queued, informational
 * - `success`  done, hired, connected, passed
 * - `warning`  needs attention, partially complete
 * - `danger`   failed, rejected, blocked
 * - `accent`   the user's own or currently-selected state (sage wash, never
 *              chartreuse: chartreuse is reserved for live signals)
 *
 * Pair colour with text or an icon. Never rely on tone alone.
 */
export type StatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type StatusPillSize = "sm" | "md";

const toneClasses: Record<StatusPillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-status-quiet text-status-quiet-ink",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  accent: "bg-accent text-accent-foreground",
};

const sizeClasses: Record<StatusPillSize, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-[12px]",
};

export function StatusPill({
  tone = "neutral",
  size = "md",
  dot = false,
  icon: Icon,
  children,
  className,
}: {
  tone?: StatusPillTone;
  size?: StatusPillSize;
  /** A leading dot in the current text colour. Decorative. */
  dot?: boolean;
  /** A leading icon. Decorative: the text carries the meaning. */
  icon?: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  /**
   * Escape hatch for call sites whose colours are computed elsewhere. Classes
   * here win over the tone via tailwind-merge.
   */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-chrome inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none",
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {children}
    </span>
  );
}
