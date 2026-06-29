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

export type CandidateInterviewItem = {
  id: string;
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
  briefContent?: InterviewBrief | null;
};

export type UpcomingInterviewItem = CandidateInterviewItem & {
  candidateId: string;
  candidateName: string;
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
