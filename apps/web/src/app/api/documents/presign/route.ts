import { NextResponse, type NextRequest } from "next/server";

import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  createDocumentStorageKey,
  documentUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage, storageProvider } from "@/lib/storage";
import {
  appendStorageUploadIntent,
  createStorageUploadIntent,
} from "@/lib/storage-upload-intent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePermission("documents:manage");
    const parsed = documentUploadRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid document upload." }, { status: 400 });
    const key = createDocumentStorageKey(context.organization.id, parsed.data.filename);
    const result = await storage.getPresignedUploadUrl({
      key,
      contentType: parsed.data.contentType,
      contentLength: parsed.data.contentLength,
    });
    const intent = createStorageUploadIntent({
      workspaceId: context.organization.id,
      key,
      contentType: parsed.data.contentType,
      contentLength: parsed.data.contentLength,
      expiresAt: Date.now() + 10 * 60_000,
    });
    return NextResponse.json({
      ...result,
      key,
      uploadUrl: storageProvider === "local" ? appendStorageUploadIntent(result.uploadUrl, intent) : result.uploadUrl,
    });
  } catch {
    return NextResponse.json({ error: "You do not have permission to upload documents." }, { status: 403 });
  }
}
