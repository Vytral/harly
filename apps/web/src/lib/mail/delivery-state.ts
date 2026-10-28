/**
 * Typed outcomes for an outbound message whose idempotency key is already
 * reserved. Pure module: no database or server-only imports, so the composer
 * copy and the action mapping can be unit tested.
 *
 * A reservation can be in one of three conflict states:
 * - `delivery_unknown`: a previous attempt may have reached the provider, so
 *   the same key must never be re-sent. The user confirms or chooses a new
 *   send explicitly.
 * - `delivery_in_progress`: another request is sending the same key right now.
 */

export type MailDeliveryConflictCode = "delivery_unknown" | "delivery_in_progress";

export const DELIVERY_UNKNOWN_MESSAGE =
  "We couldn't confirm this was sent. Check the sent folder before sending again.";

export const DELIVERY_IN_PROGRESS_MESSAGE =
  "This message is already being sent. Wait a moment, then check the thread.";

export function deliveryConflictMessage(code: MailDeliveryConflictCode): string {
  return code === "delivery_unknown"
    ? DELIVERY_UNKNOWN_MESSAGE
    : DELIVERY_IN_PROGRESS_MESSAGE;
}

/**
 * Thrown by `sendCanonicalEmail` for reservation conflicts. Existing callers
 * that catch generically keep working; mailbox actions map it to a typed
 * `{ ok: false, code }` result instead of surfacing a thrown error.
 */
export class MailDeliveryConflictError extends Error {
  readonly code: MailDeliveryConflictCode;

  constructor(code: MailDeliveryConflictCode) {
    super(deliveryConflictMessage(code));
    this.name = "MailDeliveryConflictError";
    this.code = code;
  }
}

export function isMailDeliveryConflictError(
  error: unknown,
): error is MailDeliveryConflictError {
  return error instanceof MailDeliveryConflictError;
}

export type MailActionConflictResult = {
  ok: false;
  code: MailDeliveryConflictCode;
  error: string;
};

export function conflictResult(
  code: MailDeliveryConflictCode,
): MailActionConflictResult {
  return { ok: false, code, error: deliveryConflictMessage(code) };
}
