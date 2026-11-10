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

/**
 * Translator scoped to `server.mailbox`, so the keys below resolve under
 * `server.mailbox.deliveryConflict.*` and `server.mailbox.sendFailure.*`.
 */
export type MailDeliveryTranslate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export function deliveryConflictMessage(
  code: MailDeliveryConflictCode,
  t: MailDeliveryTranslate,
): string {
  return code === "delivery_unknown"
    ? t("deliveryConflict.unknown")
    : t("deliveryConflict.inProgress");
}

/**
 * Thrown by `sendCanonicalEmail` for reservation conflicts. Existing callers
 * that catch generically keep working; mailbox actions map it to a typed
 * `{ ok: false, code }` result instead of surfacing a thrown error.
 */
export class MailDeliveryConflictError extends Error {
  readonly code: MailDeliveryConflictCode;

  constructor(code: MailDeliveryConflictCode) {
    super(`Mail delivery conflict: ${code}`);
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
  t: MailDeliveryTranslate,
): MailActionConflictResult {
  return { ok: false, code, error: deliveryConflictMessage(code, t) };
}

/** Thrown before any reservation or provider call: sample recipients never receive mail. */
export class SampleRecipientError extends Error {
  constructor() {
    super("This recipient is sample data. Sample candidates cannot receive email.");
    this.name = "SampleRecipientError";
  }
}

/** Recruiter-facing copy for a failed canonical send that is not a reservation conflict. */
export function canonicalSendFailureMessage(
  error: unknown,
  t: MailDeliveryTranslate,
): string {
  if (error instanceof SampleRecipientError) return t("sendFailure.sampleRecipient");
  return t("sendFailure.generic");
}
