import { NextResponse, type NextRequest } from "next/server";

import {
  dispatchDueWorkflowRuns,
  reclaimStalledWorkflowRuns,
} from "@/features/automations/dispatch";
import { reconcileMissedWorkflowEventWaits } from "@/features/automations/runtime/worker";
import { reconcileOrphanApplyingProposals } from "@/features/automations/run-repair";
import { reapStaleProcessingAgentReceipts } from "@/lib/ai/agent/action-receipts";
import { purgeExpiredAiConversations } from "@/features/ai-chat/data";
import { processAutomationAiJobs } from "@/features/automations/ai-jobs";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";
import { assertNotDemo, DemoActionDisabledError } from "@/features/demo/assert-not-demo";
import { cleanupExpiredWorkspaceAutomationBuckets } from "@/features/automations/runtime/operational-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "automations";
const BATCH_SIZE = 50;
// Comfortably above this scheduler's 10s interval: an "applying" proposal
// only counts as orphaned once it's had several minutes to complete a
// normal apply, so an in-flight confirmation is never reclaimed mid-request.
const ORPHAN_PROPOSAL_THRESHOLD_MINUTES = 5;

/**
 * Dedicated automation scheduler. It owns both legacy draining and v2 graph
 * runs, while domain-events only creates runs and webhooks-dispatch only
 * delivers webhooks/chat notifications. This separation keeps a slow provider
 * or webhook backlog from delaying graph waits, retries, or lease recovery.
 */
export async function POST(request: NextRequest) {
  try {
    assertNotDemo();
  } catch (error) {
    if (error instanceof DemoActionDisabledError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const reclaimed = await reclaimStalledWorkflowRuns();
    const eventWaitsReconciled = await reconcileMissedWorkflowEventWaits();
    const workflowRuns = await dispatchDueWorkflowRuns(BATCH_SIZE);
    // AI11: an "applying" AI proposal whose apply crashed between claiming
    // the row and finishing the draft save would otherwise stay stuck
    // forever, blocking any later confirmation on the same proposal. This
    // runs every cycle (well below the 5-minute orphan threshold) so a
    // crashed apply recovers within a few scheduler ticks.
    const orphanProposalsReconciled = await reconcileOrphanApplyingProposals(
      ORPHAN_PROPOSAL_THRESHOLD_MINUTES,
    );
    const agentReceiptsReaped = await reapStaleProcessingAgentReceipts(10, 100);
    const aiConversationsPurged = await purgeExpiredAiConversations(500);
    const automationAiJobs = await processAutomationAiJobs({ limit: 2 });
    const automationBucketsPruned =
      await cleanupExpiredWorkspaceAutomationBuckets({ limit: 500 });
    const counters = {
      workflowRunsReclaimed: reclaimed.reclaimed,
      workflowRunsDeadLettered: reclaimed.deadLettered,
      eventWaitsReconciled,
      workflowRunsQueued: workflowRuns.queued,
      orphanProposalsReconciled,
      agentReceiptsReaped,
      aiConversationsPurged,
      automationAiJobs,
      automationBucketsPruned,
    };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
