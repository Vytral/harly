"use client";

import { InterviewDateBadge } from "./InterviewDateBadge";
import {
  VideoCameraIcon,
  CheckCircleIcon,
  MapPinIcon,
  PhoneIcon,
} from "@/components/ui/icons/phosphor";
import { formatEnumLabel } from "@/lib/format";
import type { PortalInterview } from "@/server/portal-applications";

type PortalInterviewListProps = {
  interviews: PortalInterview[];
  variant?: "upcoming" | "past";
  heading?: string;
};

function formatTimeRange(scheduledAt: Date, durationMins: number): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const end = new Date(scheduledAt.getTime() + durationMins * 60_000);
  return `${fmt.format(scheduledAt)} - ${fmt.format(end)}`;
}

/** A video meeting link: explicit meetLink, or a URL that landed in `location`. */
function resolveMeetingUrl(interview: PortalInterview): string | null {
  if (interview.meetingUrl) return interview.meetingUrl;
  if (interview.location && /^https?:\/\//i.test(interview.location)) {
    return interview.location;
  }
  return null;
}

/** A physical address for an onsite interview (location that isn't a URL). */
function resolveAddress(interview: PortalInterview): string | null {
  if (!interview.location) return null;
  if (/^https?:\/\//i.test(interview.location)) return null;
  return interview.location;
}

function InterviewAction({ interview }: { interview: PortalInterview }) {
  const meetingUrl = resolveMeetingUrl(interview);
  const address = resolveAddress(interview);

  // Video: join button when we have a link.
  if (interview.mode === "video" && meetingUrl) {
    return (
      <a
        href={meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-2 rounded-lg bg-pine px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pine-strong active:scale-[0.98]"
      >
        <VideoCameraIcon className="size-4" />
        Join
      </a>
    );
  }

  // Onsite: directions button when we have an address.
  if (interview.mode === "onsite" && address) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      address
    )}`;
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
      >
        <MapPinIcon className="size-4" />
        Directions
      </a>
    );
  }

  // Phone: no action, just a hint.
  if (interview.mode === "phone") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <PhoneIcon className="size-4" />
        Phone call
      </span>
    );
  }

  // Fallback: show interviewer avatar if present.
  if (interview.interviewerImage) {
    return (
      <div className="hidden shrink-0 sm:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- external URL */}
        <img
          src={interview.interviewerImage}
          alt={interview.interviewerName ?? "Interviewer"}
          className="size-9 rounded-full object-cover ring-2 ring-background"
        />
      </div>
    );
  }

  return null;
}

export function PortalInterviewList({
  interviews,
  variant = "upcoming",
  heading,
}: PortalInterviewListProps) {
  const isPast = variant === "past";
  const title = heading ?? (isPast ? "Past interviews" : "Interviews");

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {interviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isPast ? "No past interviews." : "No interviews scheduled yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const address = resolveAddress(interview);
            return (
              <div
                key={interview.id}
                className={
                  isPast
                    ? "flex items-center gap-4 rounded-2xl border border-border bg-muted/30 p-4"
                    : "flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                }
              >
                <InterviewDateBadge date={interview.scheduledAt} />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-foreground">
                    {interview.title ?? formatEnumLabel(interview.type)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeRange(interview.scheduledAt, interview.durationMins)}
                  </p>
                  {/* Onsite address line */}
                  {interview.mode === "onsite" && address && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{address}</span>
                    </p>
                  )}
                </div>

                {isPast ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircleIcon className="size-4" />
                    Completed
                  </span>
                ) : (
                  <InterviewAction interview={interview} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
