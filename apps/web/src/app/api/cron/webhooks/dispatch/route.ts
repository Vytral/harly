import { NextResponse, type NextRequest } from "next/server";

import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";

export const runtime = "nodejs";
// Never cache — this mutates delivery state.
export const dynamic = "force-dynamic";

/**
 * Webhook retry dispatcher. Trigger on a schedule (Vercel Cron, system cron, or
 * a docker-compose sidecar) so failed deliveries are retried with backoff.
 *
 * Auth: `CRON_SECRET` via `Authorization: Bearer <secret>` (Vercel Cron sends
 * this automatically) or `?secret=`. If `CRON_SECRET` is unset the route is
 * disabled to avoid an unauthenticated trigger in production.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  const provided =
    auth?.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : request.nextUrl.searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await dispatchDueWebhooks();
  return NextResponse.json({ ok: true, ...summary });
}

export function GET(request: NextRequest) {
  return handle(request);
}

export function POST(request: NextRequest) {
  return handle(request);
}
