import { CalendarClock, ExternalLink, MapPin, Phone, Video } from "lucide-react";

import { listUpcomingInterviews } from "@/features/interviews/data";
import {
  interviewModeLabel,
  interviewTypeLabel,
} from "@/features/interviews/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";

const MODE_ICON = {
  video: Video,
  phone: Phone,
  onsite: MapPin,
} as const;

function gcalLink(gcalEventId: string | null): string | null {
  if (!gcalEventId) return null;
  return `https://calendar.google.com/calendar/r/search?q=${encodeURIComponent(gcalEventId)}`;
}

export default async function CalendarsPage() {
  const interviews = await listUpcomingInterviews();

  // Group interviews by date for a simple agenda view.
  const grouped = new Map<string, typeof interviews>();
  for (const iv of interviews) {
    const dateKey = new Date(iv.scheduledAt).toLocaleDateString("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const arr = grouped.get(dateKey) ?? [];
    arr.push(iv);
    grouped.set(dateKey, arr);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Calendars
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upcoming interviews across your workspace.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {interviews.length} upcoming
        </Badge>
      </header>

      {interviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarClock className="size-10 text-muted-foreground" />
            <p className="text-sm font-medium">No upcoming interviews</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Schedule an interview from a candidate&apos;s profile to see it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateLabel, items]) => (
            <section key={dateLabel}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {dateLabel}
              </h2>
              <div className="space-y-2">
                {items.map((iv) => {
                  const ModeIcon = MODE_ICON[iv.mode];
                  const calUrl = gcalLink(iv.gcalEventId);
                  return (
                    <Card key={iv.id}>
                      <CardContent className="flex items-start gap-4">
                        <span className="w-20 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                          {new Date(iv.scheduledAt).toLocaleTimeString("en", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium">
                            {iv.title ?? interviewTypeLabel(iv.type)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                              <ModeIcon className="size-3" strokeWidth={1.8} />
                              {interviewModeLabel(iv.mode)}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              {interviewTypeLabel(iv.type)}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              {iv.candidateName}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              {iv.jobTitle}
                            </span>
                            {iv.interviewerName ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
                                <UserAvatar
                                  name={iv.interviewerName}
                                  src={iv.interviewerImage}
                                  size="sm"
                                  className="size-4 text-[9px]"
                                />
                                {iv.interviewerName}
                              </span>
                            ) : null}
                          </div>
                          {iv.location ? (
                            <p className="truncate text-sm text-foreground/80">
                              {iv.location}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge variant="neutral">{iv.durationMins} min</Badge>
                          {calUrl ? (
                            <a
                              href={calUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              title="View in Google Calendar"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          ) : (
                            <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-amber-400" />
                              Not synced
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
