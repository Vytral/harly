import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, like, sql as dsql } from "drizzle-orm";

import { demoSandboxSettings } from "@harly/config";
import {
  db,
  deleteDemoSandbox,
  member,
  organization,
  seedDemoWorkspace,
  sql,
  user as userTable,
  workspaceSettings,
} from "@harly/db";

import { normalizeCareerPageConfig } from "@/features/career-page/config";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

import { applyDemoStyle, type DemoStyle } from "./sandbox-styles";
import {
  isSandboxExpired,
  parseSandboxMetadata,
  serializeSandboxMetadata,
} from "./sandbox-metadata";

const log = createLogger("demo-sandbox");

const SANDBOX_MARKER = "%harlyDemoSandbox%";

export class SandboxCapacityError extends Error {
  readonly code = "DEMO_SANDBOX_CAPACITY";
  constructor() {
    super("The demo is at capacity right now. Please try again in a few minutes.");
    this.name = "SandboxCapacityError";
  }
}

export type DemoSandbox = {
  workspaceId: string;
  userId: string;
  slug: string;
  expiresAt: Date;
};

type SandboxRow = { id: string; metadata: string | null };

async function listSandboxOrganizations(): Promise<SandboxRow[]> {
  return db
    .select({ id: organization.id, metadata: organization.metadata })
    .from(organization)
    .where(like(organization.metadata, SANDBOX_MARKER));
}

/**
 * Remove a sandbox's uploaded files from the configured storage provider.
 * Throws on failure on purpose: the caller keeps the organization row, which is
 * how a later sweep finds the sandbox again and retries the leftovers.
 */
async function deleteSandboxFiles(workspaceId: string): Promise<void> {
  for (const prefix of [`workspaces/${workspaceId}/`, `mailboxes/${workspaceId}/`]) {
    for (const key of await storage.list(prefix)) {
      await storage.delete(key);
    }
  }
}

/**
 * Sandboxes minted before the owner id was recorded: the owner is the member
 * whose email is a sandbox address (deleteDemoSandbox re-checks this).
 */
async function findLegacySandboxOwner(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: userTable.id })
    .from(member)
    .innerJoin(userTable, eq(userTable.id, member.userId))
    .where(
      and(
        eq(member.organizationId, workspaceId),
        like(userTable.email, "sandbox-%@sandbox.harly.dev"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Delete every sandbox whose lifetime has ended. Returns how many went. */
export async function purgeExpiredSandboxes(now: Date = new Date()): Promise<number> {
  const rows = await listSandboxOrganizations();
  let purged = 0;
  for (const row of rows) {
    const meta = parseSandboxMetadata(row.metadata);
    if (!meta || !isSandboxExpired(meta, now)) continue;
    try {
      // The account to delete is the one recorded when the sandbox was minted.
      // Never infer it from membership: seeded teammates are members too, and
      // their accounts are shared by every workspace.
      await deleteSandboxFiles(row.id);
      await deleteDemoSandbox({
        sql,
        workspaceId: row.id,
        ownerUserId: meta.ownerUserId ?? (await findLegacySandboxOwner(row.id)),
      });
      purged++;
    } catch (error) {
      log.error({ error, workspaceId: row.id }, "failed to purge expired sandbox");
    }
  }
  return purged;
}

/**
 * Mint a private, disposable copy of the demo workspace for one visitor: own
 * account, own workspace, seeded with the canonical Syntrix dataset and the
 * career-page style the visitor picked. Nothing a visitor does here can reach
 * another visitor or the public template.
 */
export async function createDemoSandbox(input: { style: DemoStyle }): Promise<DemoSandbox> {
  await purgeExpiredSandboxes();

  const settings = demoSandboxSettings();
  const suffix = randomBytes(5).toString("hex");
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const slug = `sbx-${suffix}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.ttlMinutes * 60_000);

  try {
    // Counting and reserving a slot is one locked step: concurrent entries
    // queue on the advisory lock, so the cap cannot be overshot. Seeding, the
    // slow part, happens after the lock is released.
    await db.transaction(async (tx) => {
      await tx.execute(dsql`SELECT pg_advisory_xact_lock(hashtext('harly-demo-sandbox-slots'))`);
      const live = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(like(organization.metadata, SANDBOX_MARKER));
      if (live.length >= settings.maxActive) throw new SandboxCapacityError();

      await tx.insert(userTable).values({
        id: userId,
        name: "Alex Morgan",
        email: `sandbox-${suffix}@sandbox.harly.dev`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(organization).values({
        id: workspaceId,
        name: "Syntrix",
        slug,
        createdAt: now,
        metadata: serializeSandboxMetadata({
          expiresAt: expiresAt.toISOString(),
          style: input.style,
          ownerUserId: userId,
        }),
      });
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId: workspaceId,
        userId,
        role: "owner",
        createdAt: now,
      });
    });

    await seedDemoWorkspace({ db, sql, workspaceId, ownerUserId: userId, sandbox: true });

    const [seeded] = await db
      .select({ config: workspaceSettings.careerPageConfig })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);
    const styled = applyDemoStyle(normalizeCareerPageConfig(seeded?.config), input.style);
    await db
      .update(workspaceSettings)
      // Sandbox boards live on the demo's own domain: never let search engines
      // index a page a visitor may have rewritten.
      .set({ careerPageConfig: { ...styled, seo: { ...styled.seo, indexable: false } } })
      .where(eq(workspaceSettings.organizationId, workspaceId));
  } catch (error) {
    if (error instanceof SandboxCapacityError) throw error;
    log.error({ error, workspaceId }, "sandbox creation failed; cleaning up");
    await deleteDemoSandbox({ sql, workspaceId, ownerUserId: userId }).catch((cleanupError) =>
      log.error({ error: cleanupError, workspaceId }, "sandbox cleanup failed"),
    );
    throw error;
  }

  return { workspaceId, userId, slug, expiresAt };
}
