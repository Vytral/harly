import "server-only";

import { eq, desc } from "drizzle-orm";
import { db, auditLogs, passkeys, workspaceSettings } from "@harly/db";

export async function getSecurityPasskeys(userId: string) {
  const rows = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deviceType: r.deviceType,
    backedUp: r.backedUp,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function getWorkspaceSecuritySettings(workspaceId: string) {
  const [row] = await db
    .select({ require2fa: workspaceSettings.require2fa })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return { require2fa: row?.require2fa ?? false };
}

export async function getWorkspaceAuditLogs(workspaceId: string) {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.workspaceId, workspaceId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    actorEmail: r.actorEmail,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    metadata: r.metadata as Record<string, unknown> | null,
    severity: r.severity,
    createdAt: r.createdAt.toISOString(),
  }));
}
