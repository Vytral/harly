import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * DocuSeal webhook payload helpers. DocuSeal's built-in webhook auth is weaker
 * than DocuSign HMAC (no per-body signature on self-hosted by default), so we
 * gate the endpoint on an unguessable per-workspace shared secret carried in the
 * callback URL (`?secret=`) and compared in constant time. The payload itself is
 * tolerant JSON — extra fields are ignored.
 */

export type DocusealWebhookSubmitter = {
  id?: number;
  uuid?: string;
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  completed_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
};

export type DocusealWebhookEvent = {
  event_type: string;
  timestamp?: string;
  data?: {
    // Submission-level events (`submission.*`): id is the submission id.
    // Form-level events (`form.*`): id is the submitter id; the submission id
    // lives under data.submission.id.
    id?: number;
    status?: string;
    role?: string;
    email?: string;
    name?: string;
    decline_reason?: string | null;
    completed_at?: string | null;
    declined_at?: string | null;
    audit_log_url?: string | null;
    combined_document_url?: string | null;
    metadata?: Record<string, string> | null;
    submission?: {
      id?: number;
      status?: string;
      audit_log_url?: string | null;
      combined_document_url?: string | null;
    };
    submitters?: DocusealWebhookSubmitter[];
  };
};

/** Constant-time secret comparison; false on any length/decode mismatch. */
export function verifyDocusealSecret(
  provided: string | null,
  expected: string | null,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The DocuSeal submission id (our providerEnvelopeId) from any event shape. */
export function webhookSubmissionId(event: DocusealWebhookEvent): string | null {
  const isSubmissionEvent = event.event_type.startsWith("submission.");
  const id = isSubmissionEvent
    ? event.data?.id
    : (event.data?.submission?.id ?? event.data?.id);
  return id === undefined || id === null ? null : String(id);
}

/** The submission-level status, preferring the nested submission block. */
export function webhookSubmissionStatus(event: DocusealWebhookEvent): string | undefined {
  return event.data?.submission?.status ?? event.data?.status;
}

/** Read a correlation value from the submitter metadata (offerId/documentId/etc). */
export function webhookMetadata(
  event: DocusealWebhookEvent,
  key: string,
): string | null {
  return event.data?.metadata?.[key] ?? null;
}

/** Stable idempotency key: submission id + event type + timestamp. */
export function webhookEventKey(event: DocusealWebhookEvent): string {
  return [
    webhookSubmissionId(event) ?? "",
    event.event_type,
    event.timestamp ?? "",
  ].join("|");
}
