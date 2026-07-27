import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, mailboxes } from "@harly/db";
import { syncMailbox } from "@/lib/mailbox/sync";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "mailbox-sync";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const enabled = await db.select({ workspaceId: mailboxes.workspaceId }).from(mailboxes).where(eq(mailboxes.enabled, true));
    const results: PromiseSettledResult<Awaited<ReturnType<typeof syncMailbox>>>[] = [];
    for (let index = 0; index < enabled.length; index += 4) {
      results.push(
        ...(await Promise.allSettled(
          enabled.slice(index, index + 4).map(({ workspaceId }) => syncMailbox(workspaceId)),
        )),
      );
    }
    const counters = { synchronized: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length };
    await run.finish(counters.failed > 0 ? "failed" : "succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
