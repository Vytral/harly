import { and, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { consentRecords, candidates, db } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { extractRequestMeta, logAuditEvent } from "@/lib/audit-log";

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (context.roleKey !== "owner" && context.roleKey !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can export consent reports." }, { status: 403 });
  }
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
    .innerJoin(candidates, eq(candidates.id, consentRecords.candidateId))
    .where(and(
      eq(consentRecords.workspaceId, context.organization.id),
      query ? or(ilike(candidates.email, `%${query}%`), ilike(consentRecords.consentType, `%${query}%`)) : undefined,
    ))
    .orderBy(desc(consentRecords.createdAt))
    .limit(50_000);
  const report = rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), withdrawnAt: row.withdrawnAt?.toISOString() ?? null }));
  await logAuditEvent({
    workspaceId: context.organization.id,
    actorId: context.user.id,
    actorEmail: context.user.email,
    ...extractRequestMeta(request),
    action: "consent_report.exported",
    resourceType: "consent_records",
    severity: "warning",
    metadata: { format, query: query ?? null, count: report.length },
  });
  if (format === "json") return NextResponse.json({ exportedAt: new Date().toISOString(), records: report }, { headers: { "Cache-Control": "private, no-store" } });
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["id", "candidate_id", "candidate_email", "application_id", "consent_type", "granted", "withdrawn_at", "ip_address", "created_at"];
  const body = report.map((row) => [row.id, row.candidateId, row.candidateEmail, row.applicationId, row.consentType, row.granted, row.withdrawnAt, row.ipAddress, row.createdAt].map(escape).join(","));
  return new Response(`\ufeff${[header.join(","), ...body].join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="harly-consent-report-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
