import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  createImageStorageKey,
  createResumeStorageKey,
  imageUploadRequestSchema,
  resumeUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage, storageProvider } from "@/lib/storage";
import {
  appendStorageUploadIntent,
  createStorageUploadIntent,
} from "@/lib/storage-upload-intent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { kind?: unknown };
  const kind = body?.kind === "image" ? "image" : "resume";

  const schema =
    kind === "image" ? imageUploadRequestSchema : resumeUploadRequestSchema;
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 },
    );
  }

  const key =
    kind === "image"
      ? createImageStorageKey(context.organization.id, parsed.data.filename)
      : createResumeStorageKey(context.organization.id, parsed.data.filename);

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
    uploadUrl:
      storageProvider === "local"
        ? appendStorageUploadIntent(result.uploadUrl, intent)
        : result.uploadUrl,
    key,
  });
}
