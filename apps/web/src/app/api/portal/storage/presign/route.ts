import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import {
  createImageStorageKey,
  imageUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage, storageProvider } from "@/lib/storage";
import { appendStorageUploadIntent, createStorageUploadIntent } from "@/lib/storage-upload-intent";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await resolvePortalSession(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { kind?: unknown };
  const parsed = imageUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 },
    );
  }

  const key = createImageStorageKey(session.workspaceId, parsed.data.filename);

  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  const intent = createStorageUploadIntent({ workspaceId: session.workspaceId, key, contentType: parsed.data.contentType, contentLength: parsed.data.contentLength, expiresAt: Date.now() + 10 * 60_000 });
  return NextResponse.json({ ...result, uploadUrl: storageProvider === "local" ? appendStorageUploadIntent(result.uploadUrl, intent) : result.uploadUrl, key });
}
