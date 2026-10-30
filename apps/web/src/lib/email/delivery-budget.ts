/**
 * Upper bound on how long a business action waits for the outbox to deliver a
 * candidate or interviewer email inline. The row stays in the outbox after the
 * budget expires, so the scheduler still finishes it.
 */
export const DELIVERY_BUDGET_MS = 8_000;

export type DeliveryBudgetOutcome<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Wait for `work` for at most `budgetMs`. A rejection of `work` before the
 * budget ends propagates; one after the budget is ignored by the caller.
 */
export async function withDeliveryBudget<T>(
  work: Promise<T>,
  budgetMs: number = DELIVERY_BUDGET_MS,
): Promise<DeliveryBudgetOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<DeliveryBudgetOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), budgetMs);
  });
  const finished = work.then((value): DeliveryBudgetOutcome<T> => ({ timedOut: false, value }));
  try {
    return await Promise.race([finished, expired]);
  } finally {
    clearTimeout(timer);
  }
}
