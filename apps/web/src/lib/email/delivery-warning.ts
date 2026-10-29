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
export function emailDeliveryWarning(
  label: string,
  states: readonly OutboxDeliveryState[],
): string | undefined {
  const finalFailure = states.some((state) => state.status === "failed");
  const retrying = states.some(
    (state) => state.status === "pending" || state.status === "processing",
  );
  if (finalFailure) {
    return `The ${label} could not be sent and will not be retried automatically. Review it in Settings → Email → Delivery log.`;
  }
  if (retrying) {
    return `The ${label} could not be sent right now and will be retried automatically.`;
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
