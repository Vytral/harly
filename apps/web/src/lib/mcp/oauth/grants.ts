import "server-only";

import { and, desc, eq, exists, gt, isNull, lt, or } from "drizzle-orm";

import { db, mcpAuthorizationCodes, mcpGrants, mcpTokens, user } from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";

export type McpGrantSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  clientId: string;
  clientName: string;
  clientHost: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
};

/** Active (not revoked, not expired) grants of a workspace, newest first. */
export async function listMcpGrants(input: {
  workspaceId: string;
  userId?: string;
}): Promise<McpGrantSummary[]> {
  const rows = await db
    .select({
      id: mcpGrants.id,
      workspaceId: mcpGrants.workspaceId,
      userId: mcpGrants.userId,
      userName: user.name,
      userEmail: user.email,
      clientId: mcpGrants.clientId,
      clientName: mcpGrants.clientName,
      clientHost: mcpGrants.clientHost,
      scopes: mcpGrants.scopes,
      createdAt: mcpGrants.createdAt,
      lastUsedAt: mcpGrants.lastUsedAt,
      expiresAt: mcpGrants.expiresAt,
    })
    .from(mcpGrants)
    .innerJoin(user, eq(user.id, mcpGrants.userId))
    .where(
      and(
        eq(mcpGrants.workspaceId, input.workspaceId),
        isNull(mcpGrants.revokedAt),
        gt(mcpGrants.expiresAt, new Date()),
        // A consent whose code was never exchanged is not a connection yet.
        exists(db.select({ one: mcpTokens.id }).from(mcpTokens).where(eq(mcpTokens.grantId, mcpGrants.id))),
        input.userId ? eq(mcpGrants.userId, input.userId) : undefined,
      ),
    )
    .orderBy(desc(mcpGrants.createdAt))
    .limit(500);
  return rows;
}

export type RevokeOptions = {
  workspaceId: string;
  /** User performing the revocation (for the audit trail). Omit for system. */
  revokedBy?: string;
  reason?: string;
};

async function deleteGrantSecrets(grantIds: string[]) {
  if (grantIds.length === 0) return;
  for (const id of grantIds) {
    await db.delete(mcpTokens).where(eq(mcpTokens.grantId, id));
    await db.delete(mcpAuthorizationCodes).where(eq(mcpAuthorizationCodes.grantId, id));
  }
}

/** Revoke one grant: every access/refresh token and pending code dies at once. */
export async function revokeMcpGrant(grantId: string, options: RevokeOptions): Promise<boolean> {
  const [row] = await db
    .update(mcpGrants)
    .set({
      revokedAt: new Date(),
      revokedBy: options.revokedBy ?? null,
      revokeReason: options.reason ?? "revoked",
    })
    .where(
      and(
        eq(mcpGrants.id, grantId),
        eq(mcpGrants.workspaceId, options.workspaceId),
        isNull(mcpGrants.revokedAt),
      ),
    )
    .returning({
      id: mcpGrants.id,
      userId: mcpGrants.userId,
      clientId: mcpGrants.clientId,
      clientName: mcpGrants.clientName,
    });
  if (!row) return false;
  await deleteGrantSecrets([row.id]);
  await logAuditEvent({
    workspaceId: options.workspaceId,
    actorId: options.revokedBy,
    action: "mcp.grant.revoked",
    resourceType: "mcp_grant",
    resourceId: row.id,
    severity: options.reason === "refresh_token_reuse" ? "warning" : "info",
    metadata: {
      grantUserId: row.userId,
      clientId: row.clientId,
      clientName: row.clientName,
      reason: options.reason ?? "revoked",
    },
  });
  return true;
}

/** Revoke every active grant a user holds in a workspace; returns how many. */
export async function revokeAllMcpGrantsForUser(
  userId: string,
  workspaceId: string,
  options: { revokedBy?: string; reason?: string } = {},
): Promise<number> {
  const rows = await db
    .update(mcpGrants)
    .set({
      revokedAt: new Date(),
      revokedBy: options.revokedBy ?? null,
      revokeReason: options.reason ?? "revoked_all",
    })
    .where(
      and(
        eq(mcpGrants.userId, userId),
        eq(mcpGrants.workspaceId, workspaceId),
        isNull(mcpGrants.revokedAt),
      ),
    )
    .returning({ id: mcpGrants.id, clientId: mcpGrants.clientId, clientName: mcpGrants.clientName });
  await deleteGrantSecrets(rows.map((r) => r.id));
  for (const row of rows) {
    await logAuditEvent({
      workspaceId,
      actorId: options.revokedBy,
      action: "mcp.grant.revoked",
      resourceType: "mcp_grant",
      resourceId: row.id,
      metadata: {
        grantUserId: userId,
        clientId: row.clientId,
        clientName: row.clientName,
        reason: options.reason ?? "revoked_all",
      },
    });
  }
  return rows.length;
}

/** Record that the grant was used. Throttled to one write a minute. */
export async function touchMcpGrant(grantId: string): Promise<void> {
  const threshold = new Date(Date.now() - 60_000);
  await db
    .update(mcpGrants)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(mcpGrants.id, grantId),
        or(isNull(mcpGrants.lastUsedAt), lt(mcpGrants.lastUsedAt, threshold)),
      ),
    );
}

/** Housekeeping: drop expired tokens/codes. Cheap; called on token issuance. */
export async function purgeExpiredMcpSecrets(): Promise<void> {
  const now = new Date();
  await db.delete(mcpTokens).where(lt(mcpTokens.expiresAt, new Date(now.getTime() - 24 * 3600 * 1000)));
  await db.delete(mcpAuthorizationCodes).where(lt(mcpAuthorizationCodes.expiresAt, now));
}
