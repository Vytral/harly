import "dotenv/config";

import path from "node:path";

import { eq, sql as dsql } from "drizzle-orm";

import { createDatabaseClient, schema, seedDemoWorkspace } from "../src";
import {
  countWorkspaceScopedRows,
  evaluateSeedWipeGuard,
  WIPE_GUARD_RECORD_TABLES,
} from "../src/seed-demo-workspace";

/**
 * CLI wrapper for the demo seed. Resolves the target workspace from SEED_EMAIL
 * (the owner's first membership) and delegates to seedDemoWorkspace(). The
 * workspace + owner must already exist (created via /setup).
 *
 * The reseed DELETES every workspace-scoped row of the target workspace, so the
 * CLI refuses unless the operator names the workspace it is about to wipe:
 *
 *   SEED_CONFIRM_WIPE=<workspace-slug> pnpm db:seed:demo
 *   pnpm db:seed:demo --confirm-wipe=<workspace-slug>
 *
 * A workspace with more real-looking records than the guard allows must also be
 * pinned with DEMO_WORKSPACE_ID. The programmatic demo sandbox and cron reset
 * call seedDemoWorkspace() directly and are not affected by this guard.
 *
 * Run: pnpm db:seed:demo   (or SEED_EMAIL=you@x.com pnpm db:seed:demo)
 */

const SEED_EMAIL = (process.env.SEED_EMAIL ?? "demo@harly.dev").toLowerCase();

function readConfirmation(argv: string[], env: NodeJS.ProcessEnv): string | null {
  const flag = argv.find((arg) => arg.startsWith("--confirm-wipe="));
  if (flag) return flag.slice("--confirm-wipe=".length);
  return env.SEED_CONFIRM_WIPE ?? null;
}

async function main() {
  const { db, sql } = createDatabaseClient();

  try {
    const [user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(dsql`lower(${schema.user.email})`, SEED_EMAIL))
      .limit(1);
    if (!user) {
      throw new Error(
        `No user found for ${SEED_EMAIL}. Complete /setup to create the owner + workspace first.`,
      );
    }

    const [membership] = await db
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, user.id))
      .limit(1);
    if (!membership) {
      throw new Error(`${SEED_EMAIL} has no workspace. Complete /setup first.`);
    }

    const pinned = process.env.DEMO_WORKSPACE_ID?.trim() || null;
    if (pinned && pinned !== membership.organizationId) {
      throw new Error(
        `SEED_EMAIL workspace ${membership.organizationId} does not match DEMO_WORKSPACE_ID=${pinned}`,
      );
    }

    const [workspace] = await db
      .select({ name: schema.organization.name, slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, membership.organizationId))
      .limit(1);
    if (!workspace) {
      throw new Error(`Workspace ${membership.organizationId} no longer exists.`);
    }

    const rowCounts = await countWorkspaceScopedRows(sql, membership.organizationId);
    const realRecordCount = rowCounts
      .filter((entry) =>
        (WIPE_GUARD_RECORD_TABLES as readonly string[]).includes(entry.table),
      )
      .reduce((total, entry) => total + entry.rows, 0);

    const decision = evaluateSeedWipeGuard({
      workspaceId: membership.organizationId,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      confirmation: readConfirmation(process.argv, process.env),
      pinnedWorkspaceId: pinned,
      realRecordCount,
    });

    console.log(`Target workspace: ${workspace.name} (slug ${workspace.slug}, id ${membership.organizationId})`);
    if (!decision.allowed) {
      console.error(decision.message);
      process.exitCode = 1;
      return;
    }

    const totalRows = rowCounts.reduce((total, entry) => total + entry.rows, 0);
    console.log(`The reseed will delete ${totalRows} rows across ${rowCounts.length} tables:`);
    for (const entry of rowCounts) {
      console.log(`  ${entry.table}: ${entry.rows}`);
    }

    await seedDemoWorkspace({
      db,
      sql,
      workspaceId: membership.organizationId,
      ownerUserId: user.id,
      // CLI runs from packages/db; the web app serves uploads from apps/web.
      uploadsRoot: path.resolve(process.cwd(), "../../apps/web/uploads"),
    });
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Demo seed failed.");
  console.error(error);
  process.exit(1);
});
