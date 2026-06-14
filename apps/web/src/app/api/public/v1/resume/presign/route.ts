import { ApiError } from "@harly/api";

import {
  createResumeStorageKey,
  resumeUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage } from "@/lib/storage";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/**
 * POST /api/public/v1/resume/presign — cross-origin presigned upload URL for the
 * embed widget / custom forms. Mirrors the in-app presign route but CORS-open.
 */
export const POST = withApi(async (request) => {
  enforceRateLimit(`public:presign:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });

  // Anchor the request to a workspace (key or ?workspace=slug) to avoid open
  // upload abuse from arbitrary origins.
  await resolvePublicWorkspace(request, "applications:write");

  const parsed = resumeUploadRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid upload request.");
  }

  const key = createResumeStorageKey(parsed.data.filename);
  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  return apiOk({ ...result, key }, { cors: true });
}, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
