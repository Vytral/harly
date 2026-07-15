import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, emailOutbox } from "@harly/db";
import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { authorizeCron } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "email-outbox";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  try {
    // Process only rows whose retry window has elapsed to avoid hot-looping.
    const pending = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "pending"));
    const result = await processEmailOutbox({ limit: 100 });
    return NextResponse.json({ ok: true, ...result, eligible: pending.length });
  } finally {
    await auth.release();
  }
}
