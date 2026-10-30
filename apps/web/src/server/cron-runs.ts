import "server-only";

import { cronRuns, db } from "@harly/db";
import { randomUUID } from "node:crypto";
import { recordCronRun } from "@/server/observability/metrics";
import { sanitizeCronErrorText, type CronRunStatus } from "@/server/cron-status";

export type { CronRunStatus } from "@/server/cron-status";
export { normalizeCronRunStatus } from "@/server/cron-status";

/** Short, single-line error text. Never store stacks, parameters or addresses. */
export function sanitizeCronError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";
  return sanitizeCronErrorText(message);
}

/**
 * Start a cron run record. The app is the authoritative writer for runs it
 * executes; the scheduler only records runs the app never reached (see
 * tooling/runtime `execute`).
 */
export function startCronRun(job: string) {
  const startedAt = Date.now();
  const runId = randomUUID();
  let finished = false;
  return {
    runId,
    finish: async (
      status: CronRunStatus,
      counters: Record<string, unknown> = {},
      error?: unknown,
    ) => {
      if (finished) return;
      finished = true;
      if (status !== "skipped") recordCronRun(status);
      await db
        .insert(cronRuns)
        .values({
          job,
          runId,
          status,
          durationMs: Date.now() - startedAt,
          counters,
          error: status === "failed" && error !== undefined ? sanitizeCronError(error) : null,
        })
        .onConflictDoNothing();
    },
  };
}
