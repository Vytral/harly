import { NextResponse, type NextRequest } from "next/server";

import { authorizeCron } from "@/server/cron-auth";
import { dispatchDomainEventOutbox } from "@/server/events/outbox";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "domain-events";

/** Recover realtime notifications that were committed but not acknowledged. */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const result = await dispatchDomainEventOutbox();
    await run.finish("succeeded", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
