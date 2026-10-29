import { NextResponse, type NextRequest } from "next/server";
import { asc, eq, sql as dsql } from "drizzle-orm";

import { demoLoginEmail, demoWorkspaceId, isDemoMode } from "@harly/config";
import { db, sql, member, organization, user as userTable, seedDemoWorkspace } from "@harly/db";

import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";
import { createLogger } from "@/lib/logger";
import { purgeExpiredSandboxes } from "@/features/demo/sandbox";
import { resolveDemoResetTarget } from "@/features/demo/reset-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "demo-reset";
const log = createLogger("demo-reset");

/**
 * Periodic demo reset. Wipes and re-seeds the canonical demo template workspace
 * (the public landing page and style previews render from it), then deletes
 * expired per-visitor sandboxes. Because the seed generates all
 * timestamps relative to now(), a full reseed IS the freshness pass — no
 * separate date-compression step is needed.
 *
 * Gated by DEMO_MODE (404 otherwise) and CRON_SECRET. Requires DEMO_WORKSPACE_ID
 * when DEMO_MODE is on: the reset wipes only that pinned workspace, and refuses
 * a per-visitor sandbox. Guarded by the shared advisory lock so overlapping
 * ticks can't run two resets at once.
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
      await run.finish("failed", { reason: "owner_not_found" }, "Demo login user not found.");
      return NextResponse.json({ error: "Demo owner not found." }, { status: 503 });
    }

    // Ordered so the chosen membership is the same on every tick.
    const [membership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, owner.id))
      .orderBy(asc(member.createdAt), asc(member.id))
      .limit(1);
    if (!membership) {
      log.error({ email }, "demo-reset: demo workspace not found");
      await run.finish("failed", { reason: "workspace_not_found" }, "Demo workspace not found for the demo owner.");
      return NextResponse.json({ error: "Demo workspace not found." }, { status: 503 });
    }

    const [workspace] = await db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, membership.organizationId))
      .limit(1);
    const target = resolveDemoResetTarget({
      pinnedWorkspaceId: demoWorkspaceId(),
      memberOrganizationId: membership.organizationId,
      organizationMetadata: workspace?.metadata ?? null,
    });
    if (!target.ok) {
      log.error(
        { email, reason: target.reason, workspaceId: membership.organizationId },
        "demo-reset: refused to reset the workspace",
      );
      await run.finish("failed", { reason: target.reason }, target.message);
      return NextResponse.json({ error: target.message }, { status: 503 });
    }

    const result = await seedDemoWorkspace({
      db,
      sql,
      workspaceId: target.workspaceId,
      ownerUserId: owner.id,
    });

    // Visitor sandboxes are disposable: sweep the ones whose time is up.
    const purgedSandboxes = await purgeExpiredSandboxes();

    const durationMs = Date.now() - startedAt;
    const counters = { ...result, purgedSandboxes, durationMs };
    log.info(counters, "demo-reset: reseed complete");
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    log.error(error, "demo-reset: reseed failed");
    await run.finish("failed", { durationMs: Date.now() - startedAt }, error);
    throw error;
  } finally {
    await auth.release();
  }
}
