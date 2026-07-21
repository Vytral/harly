export type SignatureEnvelopeStatus =
  | "sent"
  | "delivered"
  | "completed"
  | "declined"
  | "voided";

/** DocuSign statuses must come from a verified Connect event, never a UI edit. */
export function isExternallyManagedSignatureProvider(
  provider: string | null | undefined,
) {
  return provider?.trim().toLowerCase() === "docusign";
}

const terminalStatuses = new Set(["completed", "declined", "voided"]);

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

/** Convert a provider poll result into the same lifecycle event vocabulary as Connect. */
export function signatureEventForProviderStatus(status: string | undefined) {
  if (status === "sent") return "envelope-sent";
  if (status === "delivered") return "envelope-delivered";
  if (status === "signed" || status === "completed") return "envelope-completed";
  if (status === "declined") return "envelope-declined";
  if (status === "voided") return "envelope-voided";
  return null;
}

/** Keep active envelopes fresh while retrying terminal artifact delivery less often. */
export function signatureReconcileDelayMs(status: string | undefined) {
  return status === "signed" || status === "completed" || status === "declined" || status === "voided"
    ? 60 * 60 * 1000
    : 5 * 60 * 1000;
}

/** Prevent late Connect deliveries from reverting a terminal envelope. */
export function canAdvanceSignatureEnvelope(
  current: string,
  next: SignatureEnvelopeStatus,
) {
  if (current === next) return false;
  if (terminalStatuses.has(current)) return false;
  return true;
}
