import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, CalendarPlus, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { InterviewsToSchedule, TodayInterview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

const timeFmt = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
});

/** Google Calendar's day view for a `YYYY-MM-DD` date (no per-event deep link is stored). */
function googleDayUrl(date: string) {
  return `https://calendar.google.com/calendar/r/day/${date.replaceAll("-", "/")}`;
}

function waitingLabel(days: number) {
  if (days <= 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Today's interviews (each row opens the candidate), then, for people who can
 * book interviews, the candidates sitting in an interview stage with nothing
 * scheduled yet.
 */
export function TodayInterviews({
  interviews,
  scheduling,
  className,
}: {
  interviews: { total: number; date: string | null; items: TodayInterview[] };
  scheduling: InterviewsToSchedule | null;
  className?: string;
}) {
  const { date } = interviews;
  const calendarHref = (date ? `/dashboard/calendars?date=${date}` : "/dashboard/calendars") as Route;

  return (
    <Tile className={className}>
      <TileHeader
        icon={CalendarClock}
        title="Today's interviews"
        count={interviews.total}
        action={<TileLink href={calendarHref}>Calendar</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-3">
        {interviews.items.length > 0 ? (
          <ul className="flex-1 space-y-0.5">
            {interviews.items.map((iv) => (
              <li
                key={iv.id}
                className="flex items-start gap-3 rounded-[var(--radius-md)] pr-3 transition-colors hover:bg-row-wash"
              >
                <Link
                  href={`/dashboard/candidates/${iv.candidateId}` as Route}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-md)] py-2.5 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                >
                  <span className="w-16 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-soft-ink">
                    {timeFmt.format(new Date(iv.scheduledAt))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{iv.candidate}</p>
                    <p className="truncate text-xs text-soft-ink">{iv.job}</p>
                    {iv.interviewer ? (
                      <span className="mt-1.5 flex items-center gap-1.5 text-xs text-soft-ink">
                        <UserAvatar
                          name={iv.interviewer}
                          src={iv.interviewerImage}
                          size="sm"
                          className="size-5 text-[10px]"
                        />
                        {iv.interviewer}
                      </span>
                    ) : null}
                  </div>
                  <Badge variant="neutral" dot={false} className="shrink-0">
                    {iv.label}
                  </Badge>
                </Link>
                {iv.inGoogleCalendar && date ? (
                  <a
                    href={googleDayUrl(date)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 pt-3 text-soft-ink hover:text-near-ink"
                    title="Open the day in Google Calendar"
                    aria-label={`Open ${iv.candidate}'s day in Google Calendar`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint
            icon={CalendarClock}
            text="No interviews today. Scheduled interviews show up here."
          />
        )}
        {interviews.total > interviews.items.length ? (
          <Link
            href={calendarHref}
            className="mx-3 mt-1 rounded-[var(--radius-md)] px-3 py-2.5 text-center text-xs font-medium text-soft-ink transition hover:bg-row-wash"
          >
            {interviews.total - interviews.items.length} more on the calendar
          </Link>
        ) : null}

        {scheduling && scheduling.total > 0 ? (
          <section aria-label="Needs scheduling" className="mt-3 border-t border-hairline pt-3">
            <h3 className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold text-near-ink">
              <CalendarPlus className="size-3.5" strokeWidth={1.8} />
              Needs scheduling
              <span className="font-chrome rounded-full bg-soft-kraft px-1.5 text-[11px] leading-[18px] text-soft-ink tabular">
                {scheduling.total}
              </span>
            </h3>
            <ul className="flex flex-col gap-0.5">
              {scheduling.items.map((c) => (
                <li key={c.applicationId}>
                  <Link
                    href={`/dashboard/candidates/${c.candidateId}` as Route}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-soft-ink">
                        {c.job} · {c.stage}
                      </p>
                    </div>
                    <Badge variant={c.ageDays > 3 ? "warning" : "neutral"} dot={false} className="shrink-0">
                      {waitingLabel(c.ageDays)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Tile>
  );
}
