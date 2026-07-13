import { NextResponse, type NextRequest } from "next/server";

import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";
import { authorizeCron, releaseCronLock } from "@/server/cron-auth";

export const runtime = "nodejs";
// Never cache — this mutates delivery state.
export const dynamic = "force-dynamic";

/**
 * Webhook retry dispatcher. Trigger on a schedule (Vercel Cron, system cron, or
 * a docker-compose sidecar) so failed deliveries are retried with backoff.
 *
 * Auth: `CRON_SECRET` via `Authorization: Bearer <secret>` (Vercel Cron sends
 * this automatically) or `?secret=`. If `CRON_SECRET` is unset the route is
 * disabled to avoid an unauthenticated trigger in production. A single run per
 * schedule is enforced in-process to avoid overlapping dispatches.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const denied = authorizeCron(request, "webhooks-dispatch");
  if (denied) return denied;
  try {
    const summary = await dispatchDueWebhooks();
    return NextResponse.json({ ok: true, ...summary });
  } finally {
    releaseCronLock("webhooks-dispatch");
  }
}

export function GET(request: NextRequest) {
  return handle(request);
}

export function POST(request: NextRequest) {
  return handle(request);
}
