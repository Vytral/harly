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

import { sanitizeErrorMessage } from "@/lib/sanitize-error";

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

const CRON_ERROR_MAX_LENGTH = 500;

/**
 * Single-line, bounded error text for `cron_runs.error`. Driver messages append
 * the query's bound parameters, which include recipient addresses, so the
 * parameter list is removed first. The rest goes through the same redaction as
 * integration health errors (URLs, credentials, emails, tokens). Stacks are
 * never stored.
 */
export function sanitizeCronErrorText(message: string): string {
  const withoutParams = message.replace(/\bparams:[\s\S]*$/i, "");
  return sanitizeErrorMessage(withoutParams, CRON_ERROR_MAX_LENGTH) || "unknown error";
}

