import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * DocuSeal webhook payload helpers. Prefer a body HMAC when the provider or a
 * proxy supplies one, with a per-workspace secret header as the self-hosted
 * fallback. Secrets never belong in the callback URL because URLs are commonly
 * logged by proxies, browsers, and observability tools.
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

/**
 * Authenticate a webhook using a body signature or the header-only fallback.
 * The HMAC accepts the conventional `sha256=<hex>` form as well as bare hex.
 */
export function verifyDocusealWebhookAuth(input: {
  rawBody: string;
  signature: string | null;
  sharedSecret: string | null;
  expectedSecret: string | null;
}): boolean {
  const expectedSecret = input.expectedSecret?.trim() ?? "";
  if (!expectedSecret) return false;

  if (input.signature) {
    const provided = input.signature.trim().replace(/^sha256=/i, "");
    const expected = createHmac("sha256", expectedSecret)
      .update(input.rawBody)
      .digest("hex");
    if (!/^[a-f0-9]+$/i.test(provided)) return false;
    return verifyDocusealSecret(provided.toLowerCase(), expected);
  }

  return verifyDocusealSecret(input.sharedSecret, expectedSecret);
}

/**
 * A terminal webhook is actionable only when its event name and the status
 * returned by DocuSeal agree. The route uses this after an active provider GET.
 */
export function isVerifiedDocusealTerminalEvent(
  eventType: string,
  providerStatus: string | null | undefined,
): boolean {
  const event = eventType.trim().toLowerCase();
  const status = providerStatus?.trim().toLowerCase();
  if (!status) return false;

  if (event === "submission.completed" || event === "form.completed") {
    return status === "completed";
  }
  if (event === "submission.declined" || event === "form.declined") {
    return status === "declined";
  }
  if (event === "submission.expired" || event === "form.expired") {
    return status === "expired";
  }
  if (event === "submission.archived" || event === "form.archived") {
    return status === "archived" || status === "voided";
  }
  return false;
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
