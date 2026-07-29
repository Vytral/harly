import { NextResponse, type NextRequest } from "next/server";

import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";
import { dispatchDueSlack, purgeOldSlackDeliveries } from "@/server/notify/slack";
import { reclaimStalledWorkflowRuns } from "@/features/automations/dispatch";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
// Never cache , this mutates delivery state.
export const dynamic = "force-dynamic";

/**
 * Webhook retry dispatcher. Trigger on a schedule (system cron or the
 * docker-compose scheduler sidecar) so failed deliveries are retried with
 * backoff. Also reclaims stalled workflow automation runs (trade-off T3) so a
 * crashed best-effort run is marked failed instead of blocking the anti-loop
 * detector forever.
 *
 * Auth: `CRON_SECRET` via `Authorization: Bearer <secret>` only. If
 * `CRON_SECRET` is unset the route is disabled to avoid an unauthenticated
 * trigger in production. A single run per schedule is enforced across replicas
 * via a PostgreSQL advisory lock.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCron(request, "webhooks-dispatch");
  if (!auth.ok) return auth.response;
  const run = startCronRun("webhooks-dispatch");
  try {
    const summary = await dispatchDueWebhooks();
    const slack = await dispatchDueSlack();
    const slackDeliveriesPurged = await purgeOldSlackDeliveries();
    const reclaimed = await reclaimStalledWorkflowRuns();
    const counters = { ...summary, slack, slackDeliveriesPurged, workflowRunsReclaimed: reclaimed.reclaimed };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
