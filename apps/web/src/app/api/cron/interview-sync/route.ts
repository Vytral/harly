import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { retryInterviewSyncForWorkspace } from "@/features/interviews/sync-actions";
import { claimDueInterviewSyncs } from "@/lib/interviews/sync-ledger";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "interview-sync";
const BATCH_SIZE = 25;

/**
 * Retry due interview provider mutations. The ledger claims rows before any
 * external call, so overlapping cron requests cannot send duplicate retries.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);

  try {
    const claimed = await claimDueInterviewSyncs({
      workerId: `interview-sync:${randomUUID()}`,
      limit: BATCH_SIZE,
    });

    const results = await Promise.allSettled(
      claimed.map((sync) =>
        retryInterviewSyncForWorkspace({
          workspaceId: sync.workspaceId,
          syncId: sync.id,
        }),
      ),
    );
    const succeeded = results.filter(
      (result) => result.status === "fulfilled" && result.value.success,
    ).length;
    const failed = results.length - succeeded;

    const counters = {
      claimed: claimed.length,
      succeeded,
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
