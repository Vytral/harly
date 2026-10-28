import "server-only";

import { eq } from "drizzle-orm";

import { db, organization } from "@harly/db";

import { parseSandboxMetadata } from "./sandbox-metadata";

/** Expiry of a per-visitor sandbox, or null when `workspaceId` is not one. */
export async function getSandboxExpiry(workspaceId: string): Promise<Date | null> {
  const [row] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1);
  const meta = parseSandboxMetadata(row?.metadata);
  return meta ? new Date(meta.expiresAt) : null;
}

/**
 * True when `workspaceId` is a live per-visitor demo sandbox. Decided on the
 * server from the organization row, never from anything the client sends.
 */
export async function isLiveSandboxWorkspace(workspaceId: string): Promise<boolean> {
  const expiry = await getSandboxExpiry(workspaceId);
  return expiry !== null && expiry.getTime() > Date.now();
}
