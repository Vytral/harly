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
