import { RelativeTime } from "@/lib/date-hydration";

import type { CandidateActivityRow } from "./types";

const activityDotStyles: Record<string, string> = {
  "application.created": "bg-slate-info",
  "stage.changed": "bg-clay",
  "note.added": "bg-primary",
  "candidate.updated": "bg-muted-foreground",
  "file.uploaded": "bg-slate-info",
  "application.hired": "bg-primary",
  "application.rejected": "bg-destructive",
  "interview.scheduled": "bg-indigo-500",
  "interview.canceled": "bg-destructive",
  "interview.completed": "bg-emerald-500",
  "interview.rescheduled": "bg-amber-500",
};

export function ActivityTimeline({
  activity,
}: {
  activity: CandidateActivityRow[];
}) {
  return (
    <div className="space-y-1">
      {activity.map((event, index) => (
        <div key={event.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                activityDotStyles[event.type] ?? "bg-muted-foreground"
              }`}
            />
            {index < activity.length - 1 ? (
              <span className="my-1 w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="pb-4">
            <p className="text-sm font-medium">{event.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.actorName ? `${event.actorName} · ` : ""}
              <RelativeTime value={event.createdAt} />
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
