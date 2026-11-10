"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { PulseIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type ActivityItem = {
  id: string;
  type: string;
  label: string;
  detail?: string | null;
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
  "interview.scheduled": "bg-status-quiet-ink",
  "interview.canceled": "bg-destructive",
  "interview.completed": "bg-success-olive",
  "interview.rescheduled": "bg-warning-clay",
};

/**
 * Persistent, collapsible activity feed shown to the right of the candidate
 * profile. Mirrors Workable's "Resumen del candidato" rail , a live timeline of
 * stage moves, notes, messages and AI events with a friendly empty state.
 */
export function CandidateActivityRail({ activity }: { activity: ActivityItem[] }) {
  const t = useTranslations("candidates.activityRail");
  const [open, setOpen] = useState(true);

  return (
    <aside>
      <div className="rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-card)] px-5 py-4 text-left outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex items-center gap-2">
            <PulseIcon className="size-4 text-near-ink" />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{t("activity")}</span>
            {activity.length > 0 ? (
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {activity.length}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-150 ease-out",
              open ? "" : "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-150 ease-out",
            open ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="border-t border-hairline px-4 py-3">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <PulseIcon className="size-5" />
                </span>
                <p className="text-sm font-medium">{t("emptyTitle")}</p>
                <p className="max-w-[16rem] text-xs text-muted-foreground">
                  {t("emptyDescription")}
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
                      {event.detail ? (
                        <p
                          className="mt-0.5 line-clamp-2 text-xs text-soft-ink"
                          title={event.detail}
                        >
                          {event.detail}
                        </p>
                      ) : null}
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
