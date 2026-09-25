import { NextResponse, type NextRequest } from "next/server";

import { authorizeCron } from "@/server/cron-auth";
import { dispatchDomainEventOutbox } from "@/server/events/outbox";
import { dispatchWorkflowEventsFromOutbox } from "@/features/automations/dispatch";
import { startCronRun } from "@/server/cron-runs";
import { assertNotDemo, DemoActionDisabledError } from "@/features/demo/assert-not-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "domain-events";

/** Recover realtime notifications that were committed but not acknowledged. */
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
    const result = await dispatchDomainEventOutbox();
    const automations = await dispatchWorkflowEventsFromOutbox();
    const counters = { ...result, automations };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
