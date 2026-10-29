/**
 * Client-safe interview types and label helpers. No server-only imports here so
 * client components (e.g. CandidateProfileTabs) can use the labels and types.
 * Server queries live in `./data`.
 */

import type { InterviewBrief } from "@/lib/ai/schemas";

export type InterviewType =
  | "screening"
  | "culture_fit"
  | "technical"
  | "onsite"
  | "final";
export type InterviewMode = "video" | "phone" | "onsite";
export type InterviewStatus = "scheduled" | "completed" | "canceled";
export type InterviewSyncProvider =
  | "google_calendar"
  | "zoom"
  | "microsoft_teams"
  | "jitsi";
export type InterviewSyncOperation = "upsert" | "cancel";
export type InterviewSyncStatus = "pending" | "synced" | "failed" | "canceled";

export type InterviewSyncItem = {
  id: string;
  provider: InterviewSyncProvider;
  operation: InterviewSyncOperation;
  status: InterviewSyncStatus;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
};

export type CandidateInterviewItem = {
  id: string;
  applicationId: string;
  type: InterviewType;
  mode: InterviewMode;
  status: InterviewStatus;
  scheduledAt: string;
  durationMins: number;
  title: string | null;
  location: string | null;
  notes: string | null;
  interviewerId: string | null;
  interviewerName: string | null;
  interviewerImage: string | null;
  jobTitle: string;
  gcalEventId: string | null;
  meetLink: string | null;
  teamsMeetingId: string | null;
  zoomMeetingId: string | null;
  syncs?: InterviewSyncItem[];
  briefContent?: InterviewBrief | null;
};

export type UpcomingInterviewItem = CandidateInterviewItem & {
  candidateId: string;
  candidateName: string;
  jobId: string;
};

/**
 * A wall-clock time that the zone never shows, because the clocks skipped it
 * (for example 02:30 on the spring-forward day). Refused rather than moved:
 * a silent shift would send the candidate to the wrong time.
 */
export class NonexistentLocalTimeError extends RangeError {
  constructor(timeZone: string) {
    super(`That time does not exist in ${timeZone} (clocks change). Pick another time.`);
    this.name = "NonexistentLocalTimeError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The zone's offset from UTC, in ms, at the given instant (whole seconds). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const represented = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return represented - Math.floor(instant / 1000) * 1000;
}

/**
 * Convert a wall-clock time (expressed as if it were UTC) into the instant it
 * means in `timeZone`. A time that occurs twice (clocks fall back) resolves to
 * its first occurrence. A time that never occurs throws.
 */
function wallClockToInstant(wallMs: number, timeZone: string): Date {
  const candidates = new Set<number>();
  for (const offset of [
    zoneOffsetMs(wallMs - DAY_MS, timeZone),
    zoneOffsetMs(wallMs + DAY_MS, timeZone),
  ]) {
    const instant = wallMs - offset;
    if (zoneOffsetMs(instant, timeZone) === offset) candidates.add(instant);
  }
  if (candidates.size === 0) throw new NonexistentLocalTimeError(timeZone);
  return new Date(Math.min(...candidates));
}

/**
 * Parse an ISO timestamp or a wall-clock value in an IANA timezone. This is
 * intentionally client-safe so server actions and AI preparation can share
 * the same scheduling semantics without exporting a synchronous helper from
 * a `"use server"` module. Throws `NonexistentLocalTimeError` for a wall-clock
 * time the timezone skips.
 */
export function parseScheduledAt(value: string, timeZone?: string | null): Date {
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const isNaiveWallClock = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(
    value,
  );
  if (!timeZone && isNaiveWallClock && !hasExplicitOffset) {
    throw new RangeError(
      "An IANA timezone is required for a timezone-less interview time.",
    );
  }
  if (!timeZone || hasExplicitOffset) {
    return new Date(value);
  }

  const wallValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00`
    : value;
  const wallTime = new Date(`${wallValue}Z`);
  if (Number.isNaN(wallTime.getTime())) return new Date(value);

  return wallClockToInstant(wallTime.getTime(), timeZone);
}

/** Resolve the browser's IANA timezone for client forms. */
export function getBrowserTimeZone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const TYPE_LABELS: Record<InterviewType, string> = {
  screening: "Screening",
  culture_fit: "Culture fit",
  technical: "Technical",
  onsite: "Onsite",
  final: "Final round",
};

const MODE_LABELS: Record<InterviewMode, string> = {
  video: "Video",
  phone: "Phone",
  onsite: "Onsite",
};

export function interviewTypeLabel(type: InterviewType): string {
  return TYPE_LABELS[type] ?? type;
}

export function interviewModeLabel(mode: InterviewMode): string {
  return MODE_LABELS[mode] ?? mode;
}

/**
 * A pasted string is a usable meeting link when it looks like a URL. We accept
 * an explicit http(s) scheme (any case) OR a bare `host/path` (e.g.
 * "zoom.us/j/123", "meet.google.com/abc-defg-hij") and normalize the latter to
 * https. Anything else (a room number, a physical address) is not a link.
 */
export function normalizeMeetingUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // Bare domain/path: a dotted host followed by an optional path, no spaces.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
  return null;
}

/**
 * The single source of truth for what goes in `interviews.meetLink` when a user
 * supplies the location manually: only video interviews can carry a meeting
 * link, and only when the location parses as a URL. Provider integrations
 * (Zoom/Teams/Meet/Jitsi) overwrite this with the link they generate.
 */
export function deriveMeetLink(
  mode: InterviewMode,
  location: string | null | undefined,
): string | null {
  if (mode !== "video") return null;
  return normalizeMeetingUrl(location);
}
