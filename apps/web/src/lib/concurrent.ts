/**
 * Retry helper for optimistic-concurrency conflicts.
 *
 * Several server actions guard writes with a `WHERE updatedAt = <snapshot>`
 * clause so two mutations on the same row cannot clobber each other. When that
 * guard rejects the write (the row changed underneath us) the action throws a
 * sentinel error. For the common case — the same request/batch touching the row
 * a moment earlier (e.g. an AI score + profile update + stage move firing in
 * parallel) — a silent retry that re-reads the fresh row and re-applies the
 * same transition is exactly what we want.
 *
 * It is NOT blind: the caller's `attempt` callback must re-read the current
 * row and re-apply the mutation against the fresh snapshot, so stale data is
 * never replayed.
 *
 * The conflict is indistinguishable from a genuine second recruiter editing the
 * same application at the same time, so we cap attempts and surface the real
 * error if it still fails. A `lastModifiedBy` column on the application would
 * let us tell the two apart — tracked as a future improvement, intentionally
 * not added here to avoid a schema migration.
 */

export class ConcurrencyConflictError extends Error {
  constructor(message = "Application changed by another recruiter. Refresh and try again.") {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Small capped backoff with jitter before a retry. Keeps retries from
 * re-colliding instantly under real concurrent load without adding meaningful
 * latency in the common (single retry) case. Bounded so it can never hang.
 */
async function backoff(attemptNumber: number): Promise<void> {
  const base = 25 * attemptNumber;
  const jitter = Math.random() * 25;
  await new Promise((resolve) => setTimeout(resolve, base + jitter));
}

/** SQLSTATE codes for a transaction Postgres aborted to break a lock cycle or lose a serialization race. */
const TRANSACTION_ABORT_CODES = new Set(["40P01", "40001"]);

/**
 * True when Postgres aborted the whole transaction as a deadlock victim or a
 * serialization failure. Nothing from the aborted attempt was committed, so a
 * fresh attempt that re-reads its rows is safe. The driver error may be
 * wrapped (Drizzle puts it in `cause`), so walk a few levels.
 */
export function isTransactionAbort(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSACTION_ABORT_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function isConcurrencyConflict(error: unknown): boolean {
  return (
    error instanceof ConcurrencyConflictError ||
    (error instanceof Error &&
      error.message === "Application changed by another recruiter. Refresh and try again.")
  );
}

/**
 * Runs `attempt` and retries it (up to `maxAttempts` times) when it throws a
 * concurrency conflict. The `attempt` callback receives the 1-based attempt
 * number and is expected to re-read fresh state on every call. Returns the
 * resolved value of the final successful attempt.
 *
 * The `onExhausted` callback (if provided) is invoked with the last error and
 * attempt count when all retries fail, so callers can log before surfacing the
 * real error to the user.
 */
export async function withConcurrencyRetry<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  options?: {
    maxAttempts?: number;
    isConflict?: (error: unknown) => boolean;
    onExhausted?: (error: unknown, attempts: number) => void;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  // By default also retry a transaction Postgres aborted as a deadlock victim:
  // a concurrent stage kind change can lock the same rows in a different
  // order, and the user should not see "unable to move" for that.
  const isConflict =
    options?.isConflict ??
    ((error: unknown) => isConcurrencyConflict(error) || isTransactionAbort(error));

  let lastError: unknown;
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    try {
      return await attempt(attemptNumber);
    } catch (error) {
      if (!isConflict(error) || attemptNumber === maxAttempts) {
        lastError = error;
        break;
      }
      lastError = error;
      await backoff(attemptNumber);
    }
  }

  options?.onExhausted?.(lastError, maxAttempts);
  throw lastError;
}
