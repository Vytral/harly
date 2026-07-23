/**
 * Provider-neutral signature lifecycle. The envelope status vocabulary is shared
 * across providers; only the mapping from provider-specific event/status names
 * differs. This module holds the DocuSeal mapping (submission + submitter states
 * → the neutral lifecycle) plus the monotonic-advance guard reused by the
 * webhook and the reconciliation cron.
 */

export type SignatureEnvelopeStatus =
  | "sent"
  | "delivered"
  | "completed"
  | "declined"
  | "voided";

/** DocuSeal statuses come from verified webhooks/polls, never a UI edit. */
export function isExternallyManagedSignatureProvider(
  provider: string | null | undefined,
) {
  return provider?.trim().toLowerCase() === "docuseal";
}

const terminalStatuses = new Set(["completed", "declined", "voided"]);

/**
 * Map a DocuSeal submission/submitter lifecycle event to the neutral status.
 * `eventName` is one of our internal event names (see eventForDocusealWebhook /
 * eventForSubmissionStatus), NOT the raw DocuSeal event_type.
 */
export function signatureEnvelopeStatusForEvent(
  eventName: string,
): SignatureEnvelopeStatus | null {
  if (eventName === "envelope-sent") return "sent";
  if (eventName === "envelope-delivered") return "delivered";
  if (eventName === "envelope-completed") return "completed";
  if (eventName === "envelope-declined") return "declined";
  if (eventName === "envelope-voided") return "voided";
  return null;
}

/**
 * Convert a DocuSeal submission `status` (from GET /submissions/{id}) into the
 * internal event vocabulary, for the reconciliation poll path.
 */
export function signatureEventForProviderStatus(status: string | undefined) {
  const s = status?.trim().toLowerCase();
  if (s === "pending" || s === "sent" || s === "awaiting") return "envelope-sent";
  if (s === "opened") return "envelope-delivered";
  if (s === "completed") return "envelope-completed";
  if (s === "declined") return "envelope-declined";
  if (s === "expired" || s === "archived" || s === "voided") return "envelope-voided";
  return null;
}

/**
 * Map a DocuSeal webhook `event_type` to the internal event vocabulary. A
 * submitter declining is delivered as a submission-level state we normalize to
 * `envelope-declined`; `submission.expired`/`archived` become `voided`.
 */
export function eventForDocusealWebhook(
  eventType: string,
  submissionStatus?: string,
): string | null {
  switch (eventType) {
    case "submission.created":
      return "envelope-sent";
    case "submission.completed":
      return "envelope-completed";
    case "submission.expired":
      return "envelope-voided";
    case "submission.archived":
      return "envelope-voided";
    case "form.declined":
      return "envelope-declined";
    case "form.viewed":
    case "form.opened":
      return "envelope-delivered";
    case "form.completed":
      // A single-signer form completing is effectively submission completion;
      // fall back to the submission status when present.
      return signatureEventForProviderStatus(submissionStatus) === "envelope-declined"
        ? "envelope-declined"
        : "envelope-completed";
    default:
      return signatureEventForProviderStatus(submissionStatus);
  }
}

/** Keep active submissions fresh; retry terminal artifact delivery less often. */
export function signatureReconcileDelayMs(status: string | undefined) {
  const s = status?.trim().toLowerCase();
  return s === "completed" || s === "declined" || s === "expired" || s === "archived"
    ? 60 * 60 * 1000
    : 5 * 60 * 1000;
}

/** Prevent late deliveries from reverting a terminal envelope. */
export function canAdvanceSignatureEnvelope(
  current: string,
  next: SignatureEnvelopeStatus,
) {
  if (current === next) return false;
  if (terminalStatuses.has(current)) return false;
  return true;
}
