import "server-only";

/**
 * Registry of outbound webhook event types. Adding a new event here makes it
 * subscribable in the dashboard and emittable from the domain layer.
 */
export const WEBHOOK_EVENTS = [
  "application.created",
  "application.stage_changed",
  "application.hired",
  "application.rejected",
  "candidate.created",
  "candidate.updated",
  "candidate.referred",
  "candidate.referral_deleted",
  "interview.scheduled",
  "interview.canceled",
  "interview.completed",
  "interview.rescheduled",
  "job.published",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "application.created": "Application submitted",
  "application.stage_changed": "Application moved stage",
  "application.hired": "Candidate hired",
  "application.rejected": "Application rejected",
  "candidate.created": "Candidate created",
  "candidate.updated": "Candidate updated",
  "candidate.referred": "Candidate referred",
  "candidate.referral_deleted": "Candidate referral deleted",
  "interview.scheduled": "Interview scheduled",
  "interview.canceled": "Interview canceled",
  "interview.completed": "Interview completed",
  "interview.rescheduled": "Interview rescheduled",
  "job.published": "Job published",
};

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Backoff schedule (ms) indexed by attempt number. Length = max attempts. */
export const RETRY_BACKOFF_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  6 * 60 * 60_000, // 6 h
  24 * 60 * 60_000, // 24 h
] as const;

export const MAX_WEBHOOK_ATTEMPTS = RETRY_BACKOFF_MS.length;
