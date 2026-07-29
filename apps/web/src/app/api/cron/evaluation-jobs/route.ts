import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { scheduleAutoScore } from "@/features/applications/auto-score";
import { claimDueEvaluationJobs } from "@/features/evaluations/service";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "evaluation-jobs";
const BATCH_SIZE = 25;

/** Process automatic evaluations that outlived the request which created them. */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  const workerId = `evaluation-jobs:${randomUUID()}`;
  try {
    const claimed = await claimDueEvaluationJobs({ workerId, limit: BATCH_SIZE });
    const results = await Promise.allSettled(
      claimed.map((job) =>
        scheduleAutoScore(job.applicationId, job.workspaceId, {
          jobId: job.id,
          workerId,
        }),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const counters = {
      claimed: claimed.length,
      succeeded: claimed.length - failed,
      failed,
    };
    await run.finish(failed > 0 ? "failed" : "succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
