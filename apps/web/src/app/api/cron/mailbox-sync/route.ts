import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, mailboxes } from "@harly/db";
import { syncMailbox } from "@/lib/mailbox/sync";
import { authorizeCron, releaseCronLock } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "mailbox-sync";

async function handle(request: NextRequest) {
  const denied = authorizeCron(request, CRON_KEY);
  if (denied) return denied;
  try {
    const enabled = await db.select({ workspaceId: mailboxes.workspaceId }).from(mailboxes).where(eq(mailboxes.enabled, true));
    const results = await Promise.allSettled(enabled.map(({ workspaceId }) => syncMailbox(workspaceId)));
    return NextResponse.json({ ok: true, synchronized: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length });
  } finally {
    releaseCronLock(CRON_KEY);
  }
}
export const GET = handle;
export const POST = handle;
