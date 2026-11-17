import { type NextRequest } from "next/server";

import { handlePortalPresign } from "@/lib/portal-presign";
import {
  createDocumentStorageKey,
  documentUploadRequestSchema,
} from "@/lib/storage-validation";

export const runtime = "nodejs";

/**
 * Presign a candidate document upload from the portal. Auth is the candidate
 * portal session (not a dashboard session). The key lands in the workspace
 * `documents/` namespace so the submit action can verify + adopt it into the
 * Documents hub. Accepts the same content types as recruiter document uploads.
 */
export async function POST(request: NextRequest) {
  return handlePortalPresign(request, {
    schema: documentUploadRequestSchema,
    createKey: createDocumentStorageKey,
  });
}
