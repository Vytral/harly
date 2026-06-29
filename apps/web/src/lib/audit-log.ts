import "server-only";

import { db, auditLogs } from "@harly/db";

import { createLogger } from "@/lib/logger";

const log = createLogger("audit");

type AuditSeverity = "info" | "warning" | "critical";

interface LogAuditEventParams {
  workspaceId?: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
}

export async function logAuditEvent(params: LogAuditEventParams) {
  try {
    await db.insert(auditLogs).values({
      workspaceId: params.workspaceId ?? null,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail ?? null,
      action: params.action,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: params.metadata ?? null,
      severity: params.severity ?? "info",
    });
  } catch (err) {
    // Audit log failures are non-fatal — log but don't surface to caller.
    log.error(err, "[audit] Failed to write audit log");
  }
}

export function extractRequestMeta(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") ?? undefined;
  const ua = req.headers.get("user-agent") ?? undefined;
  return { ipAddress: ip, userAgent: ua };
}
