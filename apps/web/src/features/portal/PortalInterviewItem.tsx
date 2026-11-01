"use client";

import { useSyncExternalStore } from "react";

import { CalendarPlus as CalendarPlusIcon, Download as DownloadSimpleIcon } from "lucide-react";

import {
  CheckCircleIcon,
  MapPinIcon,
  PhoneIcon,
  VideoCameraIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildInterviewIcs, googleCalendarUrl, icsFileName, type CalendarInterview } from "./interview-calendar";
import { portalInterviewStatusLabel } from "./portal-interview-status";

export type PortalInterviewItemData = {
  id: string;
  title: string;
  status: Parameters<typeof portalInterviewStatusLabel>[0];
  mode: string | null;
  scheduledAt: Date;
  durationMins: number;
  location: string | null;
  meetingUrl: string | null;
  interviewerName: string | null;
  interviewerImage: string | null;
};

const noopSubscribe = () => () => {};

/**
 * Times render in the candidate's own timezone, which the server can't know.
 * The server snapshot is a fixed placeholder, so hydration never mismatches;
 * React swaps in the local value right after.
 */
function useLocal<T>(compute: () => T, placeholder: T): T {
  return useSyncExternalStore(noopSubscribe, compute, () => placeholder);
}

function timeRange(start: Date, durationMins: number): string {
  const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const end = new Date(start.getTime() + durationMins * 60_000);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function zoneName(date: Date): string {
  return (
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

function meetingLink(interview: PortalInterviewItemData): string | null {
  if (interview.meetingUrl) return interview.meetingUrl;
  if (interview.location && /^https?:\/\//i.test(interview.location)) return interview.location;
  return null;
}

function address(interview: PortalInterviewItemData): string | null {
  if (!interview.location || /^https?:\/\//i.test(interview.location)) return null;
  return interview.location;
}

function DateTile({ date, muted }: { date: Date; muted: boolean }) {
  const parts = useLocal(
    () => ({
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
      day: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date),
      month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
    }),
    { weekday: "", day: "", month: "" },
  );
  return (
    <div
      className={cn(
        "flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center",
        muted ? "bg-card-inset text-soft-ink" : "bg-lime-wash text-near-ink",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider">{parts.weekday}</span>
      <span className="mt-0.5 text-xl font-semibold leading-none tabular-nums">{parts.day}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">{parts.month}</span>
    </div>
  );
}

function AddToCalendar({ interview, orgName }: { interview: PortalInterviewItemData; orgName: string }) {
  const event: CalendarInterview = {
    id: interview.id,
    title: `${interview.title} · ${orgName}`,
    start: interview.scheduledAt,
    durationMins: interview.durationMins,
    location: meetingLink(interview) ?? address(interview),
    description: interview.interviewerName ? `With ${interview.interviewerName}` : null,
  };

  function downloadIcs() {
    const blob = new Blob([buildInterviewIcs(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = icsFileName(interview.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlusIcon />
          <span className="max-sm:sr-only">Add to calendar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <CalendarPlusIcon className="size-4" />
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={downloadIcs}>
          <DownloadSimpleIcon className="size-4" />
          Apple / Outlook (.ics)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalInterviewItem({
  interview,
  orgName,
  variant = "upcoming",
}: {
  interview: PortalInterviewItemData;
  orgName: string;
  variant?: "upcoming" | "past";
}) {
  const past = variant === "past";
  const when = useLocal(
    () => `${timeRange(interview.scheduledAt, interview.durationMins)} ${zoneName(interview.scheduledAt)}`.trim(),
    "",
  );
  const link = meetingLink(interview);
  const place = address(interview);
  const ModeIcon = interview.mode === "phone" ? PhoneIcon : interview.mode === "onsite" ? MapPinIcon : VideoCameraIcon;

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-hairline p-4 transition-[border-color,box-shadow] duration-200 sm:flex-row sm:items-center",
        past ? "bg-transparent" : "bg-card hover:border-foreground/15 hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <DateTile date={interview.scheduledAt} muted={past} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate text-[15px] font-semibold", past ? "text-soft-ink" : "text-foreground")}>
            {interview.title}
          </h3>
          <p className="mt-0.5 min-h-5 text-[13px] text-soft-ink tabular-nums">
            {when}
            {when ? <span aria-hidden="true"> · </span> : null}
            {interview.durationMins} min
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-soft-ink">
            <span className="inline-flex items-center gap-1">
              <ModeIcon className="size-3.5" />
              {interview.mode === "phone" ? "Phone call" : interview.mode === "onsite" ? (place ?? "On-site") : "Video call"}
            </span>
            {interview.interviewerName ? (
              <span className="inline-flex items-center gap-1.5">
                {interview.interviewerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- workspace user avatar
                  <img src={interview.interviewerImage} alt="" className="size-4 rounded-full object-cover" />
                ) : null}
                with {interview.interviewerName}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {past ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 self-start text-[13px] font-medium sm:self-center",
            interview.status === "completed" ? "text-success-olive" : "text-soft-ink",
          )}
        >
          {interview.status === "completed" ? <CheckCircleIcon className="size-4" /> : null}
          {portalInterviewStatusLabel(interview.status)}
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <AddToCalendar interview={interview} orgName={orgName} />
          {link ? (
            <Button size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                <VideoCameraIcon />
                Join
              </a>
            </Button>
          ) : place ? (
            <Button size="sm" variant="outline" asChild>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPinIcon />
                Directions
              </a>
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}
