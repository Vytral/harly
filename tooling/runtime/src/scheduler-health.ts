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
