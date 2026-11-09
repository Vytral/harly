/**
 * Non-blocking warning copy for an email that was queued alongside a business
 * action (stage move, interview change). The wording must be accurate: a
 * retry is promised only when the outbox actually holds a retry for it.
 */

export type OutboxDeliveryState = {
  status: string;
};

/**
 * `pending` and `processing` rows are still owned by the outbox worker and are
 * retried (or re-claimed) automatically; `failed` rows are terminal. `sent`
 * and `cancelled` rows produce no warning.
 */
/** Translator bound to the `server.emailDelivery` namespace. */
export type DeliveryTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

export function emailDeliveryWarning(
  t: DeliveryTranslator,
  label: string,
  states: readonly OutboxDeliveryState[],
): string | undefined {
  const finalFailure = states.some((state) => state.status === "failed");
  const retrying = states.some(
    (state) => state.status === "pending" || state.status === "processing",
  );
  if (finalFailure) {
    return t("notSentFinal", { label });
  }
  if (retrying) {
    return t("notSentRetrying", { label });
  }
  return undefined;
}

/**
 * The email warning to show after a successful action, unless the action's
 * `warning` already says the same thing (scheduling folds email copy into it).
 */
export function unshownEmailWarning(result: {
  warning?: string;
  emailWarning?: string;
}): string | undefined {
  if (!result.emailWarning) return undefined;
  if (result.warning?.includes(result.emailWarning)) return undefined;
  return result.emailWarning;
}

const MAX_STORED_ERROR_LENGTH = 500;
const EMAIL_ADDRESS = /[^\s@<>"',;()]+@[^\s@<>"',;()]+/g;

/**
 * Error text that may be stored on an outbox row or shown in the delivery log.
 * Driver messages carry the query's bound parameters, which include recipient
 * addresses, so the parameter list and every address are removed.
 */
export function sanitizeDeliveryError(message: string): string {
  const cleaned = message
    .replace(/\bparams:[\s\S]*$/i, "")
    .replace(EMAIL_ADDRESS, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_STORED_ERROR_LENGTH);
  return cleaned || "delivery failed";
}

/**
 * Recruiter copy for an offer send, from the outbox row's state after the
 * send attempt. Only a `pending`/`processing` row is promised a retry.
 */
export function offerSendOutcomeMessage(status: string, t: DeliveryTranslator): string {
  switch (status) {
    case "sent":
      return t("offerAlreadySent");
    case "pending":
    case "processing":
      return t("offerRetryQueued");
    case "failed":
      return t("offerUnconfirmed");
    default:
      return t("offerNotQueued");
  }
}
