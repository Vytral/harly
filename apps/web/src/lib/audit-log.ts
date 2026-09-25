import "server-only";

import { db, auditLogs } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { getTrustedClientIp } from "@/server/security/policy";

const log = createLogger("audit");

export type AuditSeverity = "info" | "warning" | "critical";

export interface LogAuditEventParams {
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

const BLOCKED_METADATA_KEYS = new Set([
  "body",
  "content",
  "credentials",
  "cookie",
  "html",
  "password",
  "prompt",
  "raw",
  "secret",
  "token",
  "useragent",
  "user_agent",
  "response",
  "preview",
]);

function isBlockedMetadataKey(key: string) {
  const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
  return BLOCKED_METADATA_KEYS.has(normalized);
}

/**
 * Keep audit metadata useful without allowing free-form content, credentials,
 * or unbounded nested JSON into the compliance surface.
 */
export function sanitizeAuditMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  function sanitize(input: unknown, depth: number): unknown {
    if (input === null || typeof input === "boolean" || typeof input === "number") {
      return input;
    }
    if (typeof input === "string") return input.slice(0, 500);
    if (depth >= 2 || typeof input !== "object" || Array.isArray(input)) return undefined;

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(input)) {
      if (isBlockedMetadataKey(key) || Object.keys(output).length >= 40) continue;
      const sanitized = sanitize(child, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }

  const sanitized = sanitize(value, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : null;
}

export async function logAuditEvent(params: LogAuditEventParams): Promise<boolean> {
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
      metadata: sanitizeAuditMetadata(params.metadata) ?? null,
      severity: params.severity ?? "info",
    });
    return true;
  } catch (err) {
    // Audit logging remains non-fatal for existing domain actions, but the
    // boolean result lets critical callers surface/measure a missing record.
    log.error(err, "[audit] Failed to write audit log");
    return false;
  }
}

export function extractRequestMeta(req: Request) {
  const ip = getTrustedClientIp(req);
  const ua = req.headers.get("user-agent") ?? undefined;
  return { ipAddress: ip, userAgent: ua };
}
