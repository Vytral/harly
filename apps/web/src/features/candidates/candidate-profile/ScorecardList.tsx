import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

import type { Scorecard } from "./types";

const RATING_META = {
  strong: {
    label: "Strong",
    icon: ThumbsUp,
    className: "text-primary",
    accent: "bg-lime",
  },
  mixed: {
    label: "Mixed",
    icon: Minus,
    className: "text-clay",
    accent: "bg-clay",
  },
  weak: {
    label: "Weak",
    icon: ThumbsDown,
    className: "text-destructive",
    accent: "bg-destructive",
  },
} as const;

export function ScorecardList({ scorecards }: { scorecards: Scorecard[] }) {
  return (
    <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
      {scorecards.map((scorecard) => {
        const meta = RATING_META[scorecard.rating];
        return (
          <div
            key={scorecard.id}
            className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
          >
            <span
              aria-hidden
              className={cn("absolute inset-y-0 left-0 w-1", meta.accent)}
            />
            <div className="space-y-2 p-5 pl-6">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-semibold",
                    meta.className,
                  )}
                >
                  <meta.icon className="size-4" strokeWidth={2} />
                  {meta.label}
                </span>
                {scorecard.stageName ? (
                  <Badge variant="neutral">{scorecard.stageName}</Badge>
                ) : null}
              </div>
              {scorecard.comment ? (
                <p className="whitespace-pre-line text-sm">{scorecard.comment}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {scorecard.authorName ?? "Someone"} ·{" "}
                <RelativeTime value={scorecard.createdAt} />
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
