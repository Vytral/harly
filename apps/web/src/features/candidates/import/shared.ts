import "server-only";

// Shared utilities for the ATS importers (Greenhouse, Workable, Ashby, Lever).
// Keeping the rate limiter, retry-after parsing, and the import cap message here
// prevents drift across the four integrations and gives Lever the same
// throttling Workable already had without duplicating the logic.

/**
 * Hard cap on how many candidates a single import can bring in. Matches the
 * MAX_IMPORT_ROWS bound on the CSV path so ATS imports are never unbounded.
 */
export const IMPORT_MAX_CANDIDATES = 5_000;

export type Sleep = (delayMs: number) => Promise<void>;

export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Sliding-window request limiter. Defaults to ~0.9 req/s (9 per 10s), safe for
 * the tighter rate limits on Workable and Lever's REST APIs. Used per importer
 * so a single slow source can't starve the others.
 */
export function createRequestLimiter(
  sleepImpl: Sleep,
  requestsPerWindow = 9,
  windowMs = 10_000,
): () => Promise<void> {
  const requestTimes: number[] = [];

  return async function acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      while (requestTimes[0] !== undefined && requestTimes[0] <= now - windowMs) {
        requestTimes.shift();
      }

      if (requestTimes.length < requestsPerWindow) {
        requestTimes.push(now);
        return;
      }

      const oldest = requestTimes[0] ?? now;
      await sleepImpl(Math.max(50, oldest + windowMs - now + 50));
    }
  };
}

/** Parses a Retry-After header, supporting both delta-seconds and HTTP-date. */
export function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

/**
 * Shared "over the cap" message. `term` is "opportunities" for Lever (its API
 * name) and "candidates" everywhere else, so the wording stays accurate per
 * source while the structure and the cap value stay in lockstep.
 */
export function capExceededMessage(term: "candidates" | "opportunities" = "candidates"): string {
  return `This import exceeds ${IMPORT_MAX_CANDIDATES.toLocaleString()} ${term}. Contact support to run a staged migration.`;
}
