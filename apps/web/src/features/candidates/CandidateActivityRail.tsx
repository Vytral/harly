"use client";

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";

import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type ActivityItem = {
  id: string;
  type: string;
  label: string;
  actorName: string | null;
  createdAt: string;
};

const DOT_STYLES: Record<string, string> = {
  "application.created": "bg-primary",
  "application.hired": "bg-primary",
  "application.rejected": "bg-destructive",
  "stage.changed": "bg-info",
  "note.added": "bg-accent-foreground",
  "note.mentioned": "bg-accent-foreground",
  "file.uploaded": "bg-muted-foreground",
  "evaluation.ai_generated": "bg-primary",
  "candidate.updated": "bg-muted-foreground",
};

/**
 * Persistent, collapsible activity feed shown to the right of the candidate
 * profile. Mirrors Workable's "Resumen del candidato" rail — a live timeline of
 * stage moves, notes, messages and AI events with a friendly empty state.
 */
export function CandidateActivityRail({ activity }: { activity: ActivityItem[] }) {
  const [open, setOpen] = useState(true);

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-2xl border border-border/70 bg-card">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <Activity className="size-4 text-primary" strokeWidth={1.8} />
            <span className="text-sm font-semibold">Activity</span>
            {activity.length > 0 ? (
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {activity.length}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-300",
              open ? "" : "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="border-t border-border/60 px-4 py-3">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Activity className="size-5" strokeWidth={1.6} />
                </span>
                <p className="text-sm font-medium">No activity yet</p>
                <p className="max-w-[16rem] text-xs text-muted-foreground">
                  Stage moves, comments, messages and AI events will show up here.
                </p>
              </div>
            ) : (
              <ol className="max-h-[62vh] space-y-0 overflow-y-auto pr-1">
                {activity.map((event, index) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          DOT_STYLES[event.type] ?? "bg-muted-foreground",
                        )}
                      />
                      {index < activity.length - 1 ? (
                        <span className="my-1 w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium leading-snug">{event.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {event.actorName ? `${event.actorName} · ` : ""}
                        <RelativeTime value={event.createdAt} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
