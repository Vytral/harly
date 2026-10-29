import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, emailOutbox } from "@harly/db";
import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "email-outbox";
/**
 * Maximum rows claimed per run. The run budget below bounds the time; a run
 * that hits the budget hands unstarted rows back to the queue.
 */
const BATCH_SIZE = 100;
/**
 * No new row starts after this budget. Worst-case provider waits are bounded
 * (see packages/emails SMTP timeouts), so the run finishes before the
 * scheduler gives up at 150 seconds and holds no lock past its end.
 */
const RUN_BUDGET_MS = 120_000;

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  const deadlineAt = Date.now() + RUN_BUDGET_MS;
  try {
    const [pending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "pending"));
    const result = await processEmailOutbox({ limit: BATCH_SIZE, deadlineAt });
    const counters = { ...result, eligible: Number(pending?.count ?? 0) };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed", {}, error);
    throw error;
  } finally {
    await auth.release();
  }
}
