/**
 * One vocabulary for every writer of `cron_runs`: `succeeded | failed | skipped`.
 * Legacy rows written by the scheduler used `success`; this maps them so metrics
 * and health checks never see two words for one outcome. Pure and dependency-free
 * so the app, the scheduler and tests share exactly this rule.
 */
export const CRON_RUN_STATUSES = ["succeeded", "failed", "skipped"] as const;
export type CronRunStatus = (typeof CRON_RUN_STATUSES)[number];

export function normalizeCronRunStatus(raw: string): CronRunStatus | null {
  if (raw === "success" || raw === "succeeded") return "succeeded";
  if (raw === "failed" || raw === "skipped") return raw;
  return null;
}

export type CronRunCountRow = { job: string; status: string; count: number };

/**
 * Merge raw `(job, status)` counts into the canonical vocabulary. Rows with an
 * unknown status are dropped rather than shown as new categories.
 */
export function normalizeCronRunCounts(rows: readonly CronRunCountRow[]): Array<{
  job: string;
  status: CronRunStatus;
  count: number;
}> {
  const merged = new Map<string, { job: string; status: CronRunStatus; count: number }>();
  for (const row of rows) {
    const status = normalizeCronRunStatus(row.status);
    if (!status) continue;
    const key = `${row.job}\u0000${status}`;
    const existing = merged.get(key);
    merged.set(key, {
      job: row.job,
      status,
      count: (existing?.count ?? 0) + Number(row.count),
    });
  }
  return [...merged.values()].sort(
    (a, b) => a.job.localeCompare(b.job) || a.status.localeCompare(b.status),
  );
}
