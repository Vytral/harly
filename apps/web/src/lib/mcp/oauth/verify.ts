import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, mcpGrants, mcpTokens, member, workspaceMcpSettings } from "@harly/db";

import { mcpResource } from "./config";
import { sha256Hex } from "./crypto";

export type VerifiedMcpToken = {
  grantId: string;
  userId: string;
  workspaceId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
};

/**
 * Resolve an opaque MCP access token to its grant. Returns null for anything
 * that must be answered with 401: unknown hash, expired, wrong audience, grant
 * revoked or past its absolute cap, or the user no longer an active member of
 * the workspace. Role and permission checks are the caller's job (they are
 * re-evaluated per call, never cached in the token).
 */
export async function verifyMcpAccessToken(token: string): Promise<VerifiedMcpToken | null> {
  if (!token || token.length > 512) return null;
  const now = new Date();

  const [row] = await db
    .select({
      resource: mcpTokens.resource,
      grantId: mcpGrants.id,
      userId: mcpGrants.userId,
      workspaceId: mcpGrants.workspaceId,
      clientId: mcpGrants.clientId,
      clientName: mcpGrants.clientName,
      scopes: mcpGrants.scopes,
      memberId: member.id,
      mcpEnabled: workspaceMcpSettings.enabled,
    })
    .from(mcpTokens)
    .innerJoin(mcpGrants, eq(mcpGrants.id, mcpTokens.grantId))
    .innerJoin(
      member,
      and(
        eq(member.userId, mcpGrants.userId),
        eq(member.organizationId, mcpGrants.workspaceId),
        eq(member.status, "active"),
      ),
    )
    .leftJoin(workspaceMcpSettings, eq(workspaceMcpSettings.workspaceId, mcpGrants.workspaceId))
    .where(
      and(
        eq(mcpTokens.tokenHash, sha256Hex(token)),
        eq(mcpTokens.kind, "access"),
        gt(mcpTokens.expiresAt, now),
        gt(mcpGrants.expiresAt, now),
        isNull(mcpGrants.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  // Workspace kill switch (no settings row = enabled by default).
  if (row.mcpEnabled === false) return null;
  // Audience binding: the token was minted for this exact resource.
  if (row.resource !== mcpResource()) return null;

  return {
    grantId: row.grantId,
    userId: row.userId,
    workspaceId: row.workspaceId,
    clientId: row.clientId,
    clientName: row.clientName,
    scopes: row.scopes,
  };
}
