import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";

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

/** Delete every sandbox whose lifetime has ended. Returns how many went. */
export async function purgeExpiredSandboxes(now: Date = new Date()): Promise<number> {
  const rows = await listSandboxOrganizations();
  let purged = 0;
  for (const row of rows) {
    const meta = parseSandboxMetadata(row.metadata);
    if (!meta || !isSandboxExpired(meta, now)) continue;
    try {
      const [owner] = await db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, row.id))
        .limit(1);
      await deleteDemoSandbox({ sql, workspaceId: row.id, ownerUserId: owner?.userId ?? null });
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
  const live = await listSandboxOrganizations();
  if (live.length >= settings.maxActive) throw new SandboxCapacityError();

  const suffix = randomBytes(5).toString("hex");
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const slug = `sbx-${suffix}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.ttlMinutes * 60_000);

  try {
    await db.insert(userTable).values({
      id: userId,
      name: "Alex Morgan",
      email: `sandbox-${suffix}@sandbox.harly.dev`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(organization).values({
      id: workspaceId,
      name: "Syntrix",
      slug,
      createdAt: now,
      metadata: serializeSandboxMetadata({
        expiresAt: expiresAt.toISOString(),
        style: input.style,
      }),
    });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspaceId,
      userId,
      role: "owner",
      createdAt: now,
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
    log.error({ error, workspaceId }, "sandbox creation failed; cleaning up");
    await deleteDemoSandbox({ sql, workspaceId, ownerUserId: userId }).catch((cleanupError) =>
      log.error({ error: cleanupError, workspaceId }, "sandbox cleanup failed"),
    );
    throw error;
  }

  return { workspaceId, userId, slug, expiresAt };
}
