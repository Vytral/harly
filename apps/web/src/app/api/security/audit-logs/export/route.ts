import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  getWorkspaceAuditLogs,
  type AuditLogFilters,
} from "@/features/security/data";
import { extractRequestMeta, logAuditEvent } from "@/lib/audit-log";
import { toCsv } from "@/lib/csv";

const SEVERITIES = new Set(["info", "warning", "critical"]);

function parseDate(value: string | null, field: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}.`);
  }
  return date;
}

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function GET(request: Request) {
  try {
    const context = await getWorkspaceContext();
    if (context.roleKey !== "owner" && context.roleKey !== "admin") {
      return NextResponse.json(
        { error: "Only workspace owners and admins can export audit logs." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const severity = url.searchParams.get("severity") ?? undefined;
    if (severity && !SEVERITIES.has(severity)) {
      return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
    }

    let filters: AuditLogFilters;
    try {
      filters = {
        query: url.searchParams.get("q") ?? undefined,
        severity: severity as AuditLogFilters["severity"],
        from: parseDate(url.searchParams.get("from"), "from"),
        to: parseDate(url.searchParams.get("to"), "to"),
        limit: 50_000,
      };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid filters." },
        { status: 400 },
      );
    }

    if (filters.from && filters.to && filters.from > filters.to) {
      return NextResponse.json(
        { error: "The from date must be before the to date." },
        { status: 400 },
      );
    }

    const requestMeta = extractRequestMeta(request);
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      ...requestMeta,
      action: "audit_logs.exported",
      resourceType: "audit_logs",
      severity: "warning",
      metadata: {
        format: "csv",
        query: filters.query ?? null,
        severity: filters.severity ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
    });

    const logs = await getWorkspaceAuditLogs(context.organization.id, filters);
    const rows = [
      [
        "created_at",
        "action",
        "severity",
        "actor_email",
        "resource_type",
        "resource_id",
        "ip_address",
        "user_agent",
        "metadata",
      ],
      ...logs.map((entry) => [
        entry.createdAt,
        entry.action,
        entry.severity,
        csvValue(entry.actorEmail),
        csvValue(entry.resourceType),
        csvValue(entry.resourceId),
        csvValue(entry.ipAddress),
        csvValue(entry.userAgent),
        csvValue(entry.metadata),
      ]),
    ];

    const filename = `harly-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(`\ufeff${toCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to export audit logs." },
      { status: 500 },
    );
  }
}
