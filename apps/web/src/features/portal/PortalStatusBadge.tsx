"use client";

import { cn } from "@/lib/utils";

type PortalStatusBadgeProps = {
  status: "active" | "hired" | "rejected" | "withdrawn";
  size?: "sm" | "default";
};

const BADGE_STYLES = {
  active: "bg-pine/10 text-pine dark:bg-pine/20 dark:text-pine",
  hired: "bg-sage text-sage-ink dark:bg-sage dark:text-sage-ink",
  rejected: "bg-red-50 text-rust dark:bg-red-950/50 dark:text-rust",
  withdrawn: "bg-muted text-muted-foreground",
} as const;

const BADGE_LABELS = {
  active: "In Progress",
  hired: "Offer",
  rejected: "Not Selected",
  withdrawn: "Withdrawn",
} as const;

export function PortalStatusBadge({ status, size = "default" }: PortalStatusBadgeProps) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full font-semibold",
        BADGE_STYLES[status],
        size === "default" ? "px-2.5 py-0.5 text-xs" : "px-2 py-px text-[11px]",
      )}
    >
      {BADGE_LABELS[status]}
    </span>
  );
}