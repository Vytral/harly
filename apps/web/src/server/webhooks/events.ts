import "server-only";

/**
 * Registry of outbound webhook event types. Adding a new event here makes it
 * subscribable in the dashboard and emittable from the domain layer.
 */
export const WEBHOOK_EVENTS = [
  "application.created",
  "application.stage_changed",
  "application.status_changed",
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
  "task.created",
  "task.updated",
  "task.completed",
  "task.deleted",
  "document.signature_sent",
  "document.signature_changed",
  "document.signature_voided",
  "job.published",
  "job.updated",
  "job.closed",
  "mail.received",
  "evaluation.completed",
  "webhook.received",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "application.created": "Application submitted",
  "application.stage_changed": "Application moved stage",
  "application.status_changed": "Application status changed",
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
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.completed": "Task completed",
  "task.deleted": "Task deleted",
  "document.signature_sent": "Document sent for signature",
  "document.signature_changed": "Document signature status changed",
  "document.signature_voided": "Document signature voided",
  "job.published": "Job published",
  "job.updated": "Job updated",
  "job.closed": "Job closed",
  "mail.received": "Mail received",
  "evaluation.completed": "AI evaluation completed",
  "webhook.received": "Inbound webhook received",
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

export type WebhookEnvelopeInput = {
  event: WebhookEvent;
  workspaceId: string;
  data: Record<string, unknown>;
  eventId?: string;
  eventVersion?: number;
  schemaVersion?: number;
  occurredAt?: string;
  parentRunId?: string;
  aggregateType?: string;
  aggregateId?: string;
};

/**
 * Stable, versioned delivery contract. The original fields are intentionally
 * retained for existing consumers; new consumers should use eventId and the
 * explicit metadata fields for deduplication and replay-safe processing.
 */
export function buildWebhookEnvelope(input: WebhookEnvelopeInput): Record<string, unknown> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  return {
    event: input.event,
    eventId: input.eventId ?? null,
    eventVersion: input.eventVersion ?? 1,
    schemaVersion: input.schemaVersion ?? 1,
    occurredAt,
    created: Math.floor(Date.parse(occurredAt) / 1000),
    workspace: input.workspaceId,
    workspaceId: input.workspaceId,
    parentRunId: input.parentRunId ?? null,
    aggregate: input.aggregateType || input.aggregateId
      ? { type: input.aggregateType ?? null, id: input.aggregateId ?? null }
      : null,
    data: input.data,
  };
}
