import "dotenv/config";

import path from "node:path";

import { eq, sql as dsql } from "drizzle-orm";

import { createDatabaseClient, schema, seedDemoWorkspace } from "../src";

/**
 * CLI wrapper for the demo seed. Resolves the target workspace from SEED_EMAIL
 * (the owner's first membership) and delegates to seedDemoWorkspace(). The
 * workspace + owner must already exist (created via /setup).
 *
 * Run: pnpm db:seed:demo   (or SEED_EMAIL=you@x.com pnpm db:seed:demo)
 */

const SEED_EMAIL = (process.env.SEED_EMAIL ?? "demo@harly.dev").toLowerCase();

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
