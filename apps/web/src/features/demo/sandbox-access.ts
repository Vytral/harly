import "server-only";

import { eq } from "drizzle-orm";
import { isDemoMode } from "@harly/config";
import { db, organization } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

import { DemoActionDisabledError } from "./assert-not-demo";
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

/**
 * Demo lockdown, sandbox-aware variant of assertNotDemo(). Use it on actions
 * that only change the caller's own workspace (career page, board copy, roles
 * and member access): a visitor's private sandbox may use them freely, while
 * the canonical template and every non-demo install keep their normal rules.
 * Identity, credential, integration and egress actions must keep the strict
 * assertNotDemo().
 */
export async function assertNotDemoOutsideSandbox(): Promise<void> {
  if (!isDemoMode()) return;
  const { organization: workspace } = await getWorkspaceContext();
  if (!(await isLiveSandboxWorkspace(workspace.id))) {
    throw new DemoActionDisabledError();
  }
}
