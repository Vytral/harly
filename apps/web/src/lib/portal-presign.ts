import "server-only";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { storage, storageProvider } from "@/lib/storage";
import {
  appendStorageUploadIntent,
  createStorageUploadIntent,
} from "@/lib/storage-upload-intent";
import { readJsonBody } from "@/server/api/body";
import {
  enforceRateLimit,
  rateLimitResultFromError,
} from "@/server/api/ratelimit";

type UploadRequest = {
  filename: string;
  contentType: string;
  contentLength: number;
};

const UPLOAD_INTENT_TTL_MS = 10 * 60_000;
const MAX_BODY_BYTES = 16_000;
const PRESIGN_LIMIT = { limit: 30, windowMs: 60_000 };

/**
 * Shared handler for the candidate portal's presigned-upload routes. Auth is
 * the portal session; each candidate gets a request budget, malformed JSON is a
 * 400 (not a 500), and the body is size-capped before it is buffered.
 */
export async function handlePortalPresign<T extends UploadRequest>(
  request: NextRequest,
  options: {
    schema: ZodType<T>;
    createKey: (workspaceId: string, filename: string) => string;
    /** Extra response fields derived from the storage key. */
    extra?: (key: string) => Record<string, unknown>;
  },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await resolvePortalSession(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await enforceRateLimit(
      `portal:presign:${session.workspaceId}:${session.candidateId}`,
      PRESIGN_LIMIT,
    );
  } catch (error) {
    const result = rateLimitResultFromError(error);
    if (!result) throw error;
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many upload requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  const parsed = options.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const key = options.createKey(session.workspaceId, parsed.data.filename);
  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  const intent = createStorageUploadIntent({
    workspaceId: session.workspaceId,
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
    expiresAt: Date.now() + UPLOAD_INTENT_TTL_MS,
  });

  return NextResponse.json({
    ...result,
    ...options.extra?.(key),
    uploadUrl:
      storageProvider === "local"
        ? appendStorageUploadIntent(result.uploadUrl, intent)
        : result.uploadUrl,
    key,
  });
}
