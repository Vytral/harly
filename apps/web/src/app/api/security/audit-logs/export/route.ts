import { NextResponse } from "next/server";

import { ApiError } from "@harly/api";

import { requireDsarExport, type DsarExportAccess } from "@/features/privacy/export-access";
import { isUnrestrictedScope } from "@/features/search/scope";
import {
  getWorkspaceAuditLogs,
  type AuditLogFilters,
} from "@/features/security/data";
import { extractRequestMeta, logAuditEvent } from "@/lib/audit-log";
import { toSafeCsv } from "@/lib/csv";

/** Largest audit log export in one file. Anything beyond it is cut and flagged. */
const AUDIT_EXPORT_ROW_LIMIT = 50_000;

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
    let access: DsarExportAccess;
    try {
      access = await requireDsarExport(
        "Exporting audit logs requires the Review privacy requests and Manage security permissions.",
        { alsoRequire: "security:manage" },
      );
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    // The workspace-wide log is not a per-candidate view: a scoped role cannot
    // export it, whatever permissions it holds.
    if (!isUnrestrictedScope(access.actor.scope)) {
      return NextResponse.json(
        { error: "Exporting the audit log requires an unrestricted role scope." },
        { status: 403 },
      );
    }
    const context = access.context;

    const url = new URL(request.url);
    const severity = url.searchParams.get("severity") ?? undefined;
    const format = url.searchParams.get("format") ?? "csv";
    if (format !== "csv" && format !== "json") {
      return NextResponse.json({ error: "Invalid format." }, { status: 400 });
    }
    if (severity && !SEVERITIES.has(severity)) {
      return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
    }

    let filters: AuditLogFilters;
    try {
      filters = {
        query: url.searchParams.get("q") ?? undefined,
        action: url.searchParams.get("action") ?? undefined,
        resourceType: url.searchParams.get("resourceType") ?? undefined,
        severity: severity as AuditLogFilters["severity"],
        from: parseDate(url.searchParams.get("from"), "from"),
        to: parseDate(url.searchParams.get("to"), "to"),
        // One row past the cap, so a cut-short export is detectable.
        limit: AUDIT_EXPORT_ROW_LIMIT + 1,
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
        format,
        query: filters.query ?? null,
        severity: filters.severity ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
    });

    const fetched = await getWorkspaceAuditLogs(context.organization.id, filters);
    const truncated = fetched.length > AUDIT_EXPORT_ROW_LIMIT;
    const logs = truncated ? fetched.slice(0, AUDIT_EXPORT_ROW_LIMIT) : fetched;
    if (format === "json") {
      const filename = `harly-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
      return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), truncated, filters, logs }, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
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

    if (truncated) {
      rows.push([`# Export truncated at ${AUDIT_EXPORT_ROW_LIMIT} rows; narrow the filters to export the rest.`]);
    }
    const filename = `harly-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(`\ufeff${toSafeCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Harly-Truncated": String(truncated),
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
