"use client";

import Link from "next/link";
import type { Route } from "next";
import { InterviewDateBadge } from "./InterviewDateBadge";
import { cn } from "@/lib/utils";
import {
  MapPinIcon,
  UsersIcon,
  VideoCameraIcon,
} from "@/components/ui/icons/phosphor";

type Interviewer = {
  name: string | null;
  image: string | null;
};

type InterviewCardProps = {
  title: string;
  scheduledAt: Date;
  durationMins: number;
  location?: string | null;
  interviewers?: Interviewer[];
  meetingUrl?: string | null;
  applicationId?: string | null;
  compact?: boolean;
};

export function PortalInterviewCard({
  title,
  scheduledAt,
  durationMins,
  location,
  interviewers = [],
  meetingUrl,
  applicationId,
  compact = false,
}: InterviewCardProps) {
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(scheduledAt);

  const endTime = new Date(scheduledAt.getTime() + durationMins * 60_000);
  const endTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(endTime);

  const timeRange = `${timeStr} - ${endTimeStr}`;

  if (compact) {
    const body = (
      <div className="flex items-start gap-3 py-3">
        <InterviewDateBadge date={scheduledAt} variant="compact" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {timeRange} · {durationMins} min
          </p>
          {location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="size-3" />
              {location}
            </p>
          )}
        </div>
      </div>
    );
    if (applicationId) {
      return (
        <Link
          href={`/portal/applications/${applicationId}` as Route}
          className="block transition-colors hover:bg-muted/40"
        >
          {body}
        </Link>
      );
    }
    return <div>{body}</div>;
  }

  const card = (
    <div className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
      <InterviewDateBadge date={scheduledAt} />

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-foreground group-hover:text-primary">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {timeRange} · {durationMins} min
        </p>
        {location && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPinIcon className="size-3.5" />
            <span className="truncate">{location}</span>
          </p>
        )}
        {interviewers.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersIcon className="size-3.5" />
            <span className="truncate">
              {interviewers
                .map((i) => i.name)
                .filter(Boolean)
                .join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {meetingUrl ? (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all",
              "bg-pine hover:bg-pine-strong active:scale-[0.98]"
            )}
          >
            <VideoCameraIcon className="size-4" />
            Join
          </a>
        ) : interviewers.length > 0 ? (
          <div className="flex -space-x-2">
            {interviewers.slice(0, 3).map((interviewer, idx) =>
              interviewer.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- external URL
                <img
                  key={idx}
                  src={interviewer.image}
                  alt={interviewer.name ?? "Interviewer"}
                  className="size-8 rounded-full border-2 border-background object-cover"
                />
              ) : (
                <div
                  key={idx}
                  className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold text-muted-foreground"
                >
                  {(interviewer.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )
            )}
            {interviewers.length > 3 && (
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-foreground text-xs font-semibold text-background">
                +{interviewers.length - 3}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
  if (applicationId) {
    return (
      <Link
        href={`/portal/applications/${applicationId}` as Route}
        className="block transition-colors hover:bg-muted/40"
      >
        {card}
      </Link>
    );
  }
  return <div>{card}</div>;
}