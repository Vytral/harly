import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, emailOutbox } from "@harly/db";
import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { authorizeCron, releaseCronLock } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "email-outbox";

async function handle(_request: NextRequest) {
  const denied = authorizeCron(_request, CRON_KEY);
  if (denied) return denied;
  try {
    // Process only rows whose retry window has elapsed to avoid hot-looping.
    const pending = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "pending"));
    const result = await processEmailOutbox({ limit: 100 });
    return NextResponse.json({ ok: true, ...result, eligible: pending.length });
  } finally {
    releaseCronLock(CRON_KEY);
  }
}
export const GET = handle;
export const POST = handle;
