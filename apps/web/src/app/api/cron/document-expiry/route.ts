import { NextResponse, type NextRequest } from "next/server";

import { expireOverdueDocuments } from "@/features/documents/expiry";
import {
  expireOverdueDocumentRequestPackages,
} from "@/features/documents/requests-service";
import { resumeWorkflowDocumentWaits } from "@/features/automations/runtime/worker";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "document-expiry";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const documents = await expireOverdueDocuments();
    const packages = await expireOverdueDocumentRequestPackages();
    let resumed = 0;
    for (const pkg of packages) {
      resumed += await resumeWorkflowDocumentWaits({
        workspaceId: pkg.workspaceId,
        resourceId: pkg.packageId,
      });
    }
    for (const document of documents.documents) {
      resumed += await resumeWorkflowDocumentWaits({
        workspaceId: document.workspaceId,
        resourceId: document.documentId,
      });
    }
    const result = { documentsExpired: documents.expired, packagesExpired: packages.length, workflowsResumed: resumed };
    await run.finish("succeeded", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
