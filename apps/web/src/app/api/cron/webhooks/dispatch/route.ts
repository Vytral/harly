import { NextResponse, type NextRequest } from "next/server";

import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";
import { authorizeCron } from "@/server/cron-auth";

export const runtime = "nodejs";
// Never cache — this mutates delivery state.
export const dynamic = "force-dynamic";

/**
 * Webhook retry dispatcher. Trigger on a schedule (system cron or the
 * docker-compose scheduler sidecar) so failed deliveries are retried with
 * backoff.
 *
 * Auth: `CRON_SECRET` via `Authorization: Bearer <secret>` only. If
 * `CRON_SECRET` is unset the route is disabled to avoid an unauthenticated
 * trigger in production. A single run per schedule is enforced across replicas
 * via a PostgreSQL advisory lock.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCron(request, "webhooks-dispatch");
  if (!auth.ok) return auth.response;
  try {
    const summary = await dispatchDueWebhooks();
    return NextResponse.json({ ok: true, ...summary });
  } finally {
    await auth.release();
  }
}
