export type SchedulerHealthJob = {
  name: string;
  intervalMs: number;
};

/**
 * A scheduler's health window must follow the job cadence. A single global
 * five-minute cutoff makes intentionally daily jobs permanently stale after
 * their first successful run.
 */
export function describeSchedulerRuns(
  jobs: readonly SchedulerHealthJob[],
  runs: Record<string, string | null> | null | undefined,
  baseStaleAfterMs: number,
  now = Date.now(),
) {
  const details = jobs.map((job) => {
    const value = runs?.[job.name];
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (!value || Number.isNaN(timestamp)) return `${job.name}=never`;
    const staleAfterMs = Math.max(baseStaleAfterMs, job.intervalMs * 2);
    return `${job.name}=${new Date(timestamp).toISOString()}${
      timestamp < now - staleAfterMs ? " (stale)" : ""
    }`;
  });
  const ok = jobs.every((job) => {
    const value = runs?.[job.name];
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    const staleAfterMs = Math.max(baseStaleAfterMs, job.intervalMs * 2);
    return !Number.isNaN(timestamp) && timestamp >= now - staleAfterMs;
  });
  return { ok, detail: details.join(" ") };
}

/**
 * Run statuses that count as a fresh success for doctor and readiness. A
 * `skipped` (409) tick means another run still holds the lock, not that the
 * job did its work, so it never refreshes the job's last-success time.
 * Mirrors `CRON_RUN_STATUSES` in apps/web/src/server/cron-status.ts.
 */
export const FRESH_RUN_STATUSES = ["succeeded", "success"] as const;

/**
 * The scheduler writes a fallback `cron_runs` row only when the app did not
 * record the run and the request did not time out. On timeout the app may still
 * finish and record its own result; a fallback `failed` row would then count one
 * batch twice.
 */
export function shouldRecordSchedulerFallback(input: {
  timedOut: boolean;
  appRecorded: boolean;
}): boolean {
  return !input.timedOut && !input.appRecorded;
}

const RUN_ERROR_MAX_LENGTH = 500;
const RUN_ERROR_EMAIL = /[^\s@<>"',;()]+@[^\s@<>"',;()]+/g;

/**
 * Single-line, bounded error text for a fallback row. Mirrors
 * `sanitizeCronErrorText` in apps/web: no driver parameters, no addresses.
 */
export function sanitizeRunError(message: string): string {
  const cleaned = message
    .replace(/\bparams:[\s\S]*$/i, "")
    .replace(RUN_ERROR_EMAIL, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RUN_ERROR_MAX_LENGTH);
  return cleaned || "unknown error";
}

