import "server-only";

import { createHash } from "crypto";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

/**
 * Whether a workspace shows Gravatar pictures. Off unless an admin turned it on,
 * because a Gravatar lookup sends a hash of the candidate's email to gravatar.com.
 */
export async function getWorkspaceGravatarEnabled(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ gravatarEnabled: workspaceSettings.gravatarEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organizationId))
    .limit(1);
  return row?.gravatarEnabled === true;
}

/**
 * Gravatar URL for an email. Uses `d=404` so missing avatars fail to load,
 * letting <UserAvatar> fall back to initials. Callers must check the workspace
 * setting first; this function does not.
 */
export function gravatarUrl(email: string, size = 80): string {
  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}
