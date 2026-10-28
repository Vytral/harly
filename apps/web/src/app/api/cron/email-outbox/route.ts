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
 * Rows per run. The scheduler's timeout for this job must cover a full batch
 * (see tooling/runtime `timeoutMs`); keep the two in step when changing this.
 */
const BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const [pending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "pending"));
    const result = await processEmailOutbox({ limit: BATCH_SIZE });
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
