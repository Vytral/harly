import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { ApiError } from "@harly/api";
import { consentRecords, candidates, db } from "@harly/db";
import { requireDsarExport, type DsarExportAccess } from "@/features/privacy/export-access";
import { candidateScopeSql } from "@/features/search/scope";
import { extractRequestMeta, logAuditEvent } from "@/lib/audit-log";
import { toSafeCsv } from "@/lib/csv";

/** Largest consent report returned in one export. Anything beyond it is cut and flagged. */
const CONSENT_EXPORT_ROW_LIMIT = 50_000;

/** Closing line of a truncated CSV export, so a reader cannot take it for the whole report. */
function truncationNotice(limit: number): string {
  return `# Export truncated at ${limit} rows; narrow the search to export the rest.`;
}

export async function GET(request: Request) {
  let access: DsarExportAccess;
  try {
    access = await requireDsarExport("Exporting consent records requires the Review privacy requests permission.");
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  const { context, actor } = access;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return NextResponse.json({ error: "Invalid format." }, { status: 400 });
  const rows = await db
    .select({
      id: consentRecords.id,
      candidateId: consentRecords.candidateId,
      candidateEmail: candidates.email,
      applicationId: consentRecords.applicationId,
      consentType: consentRecords.consentType,
      granted: consentRecords.granted,
      withdrawnAt: consentRecords.withdrawnAt,
      ipAddress: consentRecords.ipAddress,
      createdAt: consentRecords.createdAt,
    })
    .from(consentRecords)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, consentRecords.candidateId),
        eq(candidates.workspaceId, context.organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .where(and(
      eq(consentRecords.workspaceId, context.organization.id),
      query ? or(ilike(candidates.email, `%${query}%`), ilike(consentRecords.consentType, `%${query}%`)) : undefined,
      candidateScopeSql(actor, consentRecords.candidateId),
    ))
    .orderBy(desc(consentRecords.createdAt))
    // One row past the cap, so the export can tell it was cut short.
    .limit(CONSENT_EXPORT_ROW_LIMIT + 1);
  const truncated = rows.length > CONSENT_EXPORT_ROW_LIMIT;
  const report = (truncated ? rows.slice(0, CONSENT_EXPORT_ROW_LIMIT) : rows).map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), withdrawnAt: row.withdrawnAt?.toISOString() ?? null }));
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    ...extractRequestMeta(request),
    action: "consent_report.exported",
    resourceType: "consent_records",
    severity: "warning",
    metadata: { format, query: query ?? null, count: report.length, truncated },
  });
  if (format === "json") return NextResponse.json({ exportedAt: new Date().toISOString(), truncated, records: report }, { headers: { "Cache-Control": "private, no-store" } });
  const header = ["id", "candidate_id", "candidate_email", "application_id", "consent_type", "granted", "withdrawn_at", "ip_address", "created_at"];
  const csvRows = [header, ...report.map((row) => [String(row.id ?? ""), String(row.candidateId ?? ""), String(row.candidateEmail ?? ""), String(row.applicationId ?? ""), String(row.consentType ?? ""), String(row.granted), String(row.withdrawnAt ?? ""), String(row.ipAddress ?? ""), row.createdAt])];
  if (truncated) csvRows.push([truncationNotice(CONSENT_EXPORT_ROW_LIMIT)]);
  return new Response(`\ufeff${toSafeCsv(csvRows)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="harly-consent-report-${new Date().toISOString().slice(0, 10)}.csv"`, "X-Harly-Truncated": String(truncated), "Cache-Control": "private, no-store" } });
}
