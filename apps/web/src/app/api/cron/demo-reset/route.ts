import { NextResponse, type NextRequest } from "next/server";
import { eq, sql as dsql } from "drizzle-orm";

import { demoLoginEmail, demoWorkspaceId, isDemoMode } from "@harly/config";
import { db, sql, member, user as userTable, seedDemoWorkspace } from "@harly/db";

import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "demo-reset";
const log = createLogger("demo-reset");

/**
 * Periodic demo reset. Wipes and re-seeds the single demo workspace so every
 * visitor lands in the same clean Syntrix state. Because the seed generates all
 * timestamps relative to now(), a full reseed IS the freshness pass — no
 * separate date-compression step is needed.
 *
 * Gated by DEMO_MODE (404 otherwise) and CRON_SECRET. Guarded by the shared
 * advisory lock so overlapping ticks can't run two resets at once.
 */
export async function POST(request: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;

  const run = startCronRun(CRON_KEY);
  const startedAt = Date.now();
  try {
    // Resolve the demo workspace from the shared login account's membership.
    const email = demoLoginEmail();
    const [owner] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(dsql`lower(${userTable.email})`, email))
      .limit(1);
    if (!owner) {
      log.error({ email }, "demo-reset: demo login user not found");
      await run.finish("failed", { reason: "owner_not_found" });
      return NextResponse.json({ error: "Demo owner not found." }, { status: 503 });
    }

    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, owner.id))
      .limit(1);
    if (!membership) {
      log.error({ email }, "demo-reset: demo workspace not found");
      await run.finish("failed", { reason: "workspace_not_found" });
      return NextResponse.json({ error: "Demo workspace not found." }, { status: 503 });
    }

    const pinned = demoWorkspaceId();
    if (pinned && pinned !== membership.organizationId) {
      log.error(
        { email, pinned, actual: membership.organizationId },
        "demo-reset: workspace id does not match DEMO_WORKSPACE_ID",
      );
      await run.finish("failed", { reason: "workspace_pin_mismatch" });
      return NextResponse.json({ error: "Demo workspace pin mismatch." }, { status: 503 });
    }

    const result = await seedDemoWorkspace({
      db,
      sql,
      workspaceId: membership.organizationId,
      ownerUserId: owner.id,
    });

    const durationMs = Date.now() - startedAt;
    const counters = { ...result, durationMs };
    log.info(counters, "demo-reset: reseed complete");
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    log.error(error, "demo-reset: reseed failed");
    await run.finish("failed", { durationMs: Date.now() - startedAt });
    throw error;
  } finally {
    await auth.release();
  }
}
