import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, emailOutbox } from "@harly/db";
import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "email-outbox";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    // Process only rows whose retry window has elapsed to avoid hot-looping.
    const pending = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "pending"));
    const result = await processEmailOutbox({ limit: 100 });
    const counters = { ...result, eligible: pending.length };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
