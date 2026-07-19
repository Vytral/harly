import { cookies } from "next/headers";

import {
  buildCandidateDataExport,
  candidateExportCsv,
  recordCompletedCandidateExport,
  type CandidateExportFormat,
} from "@/features/privacy/candidate-export";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  const session = token ? await resolvePortalSession(token) : null;
  if (!session) return new Response("Unauthorized", { status: 401 });

  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format: CandidateExportFormat = requestedFormat === "csv" ? "csv" : "json";
  if (requestedFormat && requestedFormat !== "json" && requestedFormat !== "csv") {
    return new Response("Unsupported export format", { status: 400 });
  }

  const exportData = await buildCandidateDataExport({
    candidateId: session.candidateId,
    workspaceId: session.workspaceId,
  });
  if (!exportData) return new Response("Not found", { status: 404 });

  await recordCompletedCandidateExport({
    candidateId: session.candidateId,
    workspaceId: session.workspaceId,
    requestedBy: session.email,
  });

  const body = format === "csv"
    ? candidateExportCsv(exportData)
    : JSON.stringify(exportData, null, 2);
  const extension = format === "csv" ? "csv" : "json";
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="harly-personal-data.${extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
