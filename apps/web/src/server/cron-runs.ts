import "server-only";

import { cronRuns, db } from "@harly/db";
import { randomUUID } from "node:crypto";
import { recordCronRun } from "@/server/observability/metrics";

export function startCronRun(job: string) {
  const startedAt = Date.now();
  const runId = randomUUID();
  let finished = false;
  return {
    runId,
    finish: async (status: "succeeded" | "failed", counters: Record<string, unknown> = {}) => {
      if (finished) return;
      finished = true;
      recordCronRun(status);
      await db.insert(cronRuns).values({ job, runId, status, durationMs: Date.now() - startedAt, counters }).onConflictDoNothing();
    },
  };
}
