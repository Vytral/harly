"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ArrowLineRightIcon,
  CalendarIcon,
  StarFillIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";

export type ActivityItem = {
  id: string;
  type: "applied" | "stage_change" | "interview_scheduled" | "interview_completed" | "offer" | "rejected";
  label: string;
  timestamp: Date;
};

type PortalActivityTimelineProps = {
  activities: ActivityItem[];
  compact?: boolean;
  className?: string;
};

const ICON_MAP: Record<ActivityItem["type"], React.ComponentType<{ className?: string }>> = {
  applied: CheckCircleIcon,
  stage_change: ArrowLineRightIcon,
  interview_scheduled: CalendarIcon,
  interview_completed: CheckCircleIcon,
  offer: StarFillIcon,
  rejected: XCircleIcon,
};

const DOT_STYLES: Record<ActivityItem["type"], string> = {
  applied: "bg-sage text-sage-ink dark:bg-sage dark:text-sage-ink",
  stage_change: "bg-sage text-sage-ink dark:bg-sage dark:text-sage-ink",
  interview_scheduled: "bg-pine/15 text-pine dark:bg-pine/25 dark:text-pine",
  interview_completed: "bg-sage text-sage-ink dark:bg-sage dark:text-sage-ink",
  offer: "bg-sage text-sage-ink dark:bg-sage dark:text-sage-ink",
  rejected: "bg-red-50 text-rust dark:bg-red-950 dark:text-rust",
};

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRelativeOrAbsolute(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? "Just now" : `${diffMins} min ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatShortDate(date);
}

export function PortalActivityTimeline({
  activities,
  compact = false,
  className,
}: PortalActivityTimelineProps) {
  if (activities.length === 0) return null;

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-center gap-2 text-xs">
            <div className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <span className="text-muted-foreground truncate">{activity.label}</span>
            <span className="ml-auto shrink-0 text-muted-foreground/60">
              {formatShortDate(activity.timestamp)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("relative space-y-0", className)}>
      {activities.map((activity, idx) => {
        const isLast = idx === activities.length - 1;
        const Icon = ICON_MAP[activity.type];

        return (
          <div key={activity.id} className="flex gap-3">
            {/* Timeline rail */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  DOT_STYLES[activity.type],
                )}
              >
                <Icon className="size-3.5" />
              </div>
              {!isLast && (
                <div
                  className="my-0.5 w-px flex-1 bg-border"
                  style={{ minHeight: 16 }}
                />
              )}
            </div>
            {/* Content */}
            <div className={cn("pb-4", isLast && "pb-0")}>
              <p className="text-sm text-foreground">{activity.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRelativeOrAbsolute(activity.timestamp)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}