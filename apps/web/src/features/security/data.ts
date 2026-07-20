import "server-only";

import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db, auditLogs, passkeys, workspaceSettings } from "@harly/db";
import type { AuditSeverity } from "@/lib/audit-log";
import { sanitizeAuditMetadata } from "@/lib/audit-log";

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

export type AuditLogFilters = {
  query?: string;
  severity?: AuditSeverity;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function getWorkspaceAuditLogs(
  workspaceId: string,
  filters: AuditLogFilters = {},
) {
  const query = filters.query?.trim();
  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        filters.severity ? eq(auditLogs.severity, filters.severity) : undefined,
        filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
        filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
        query
          ? or(
              ilike(auditLogs.action, `%${query}%`),
              ilike(auditLogs.actorEmail, `%${query}%`),
              ilike(auditLogs.resourceType, `%${query}%`),
              ilike(auditLogs.ipAddress, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 50_000));

  return rows.map((r) => ({
    id: r.id,
    actorEmail: r.actorEmail,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    metadata: sanitizeAuditMetadata(
      r.metadata as Record<string, unknown> | undefined,
    ),
    severity: r.severity,
    createdAt: r.createdAt.toISOString(),
  }));
}
