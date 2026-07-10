import { ApiError } from "@harly/api";

import {
  createPublicApplicationImageStorageKey,
  imageUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage } from "@/lib/storage";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/**
 * POST /api/public/v1/image/presign — public presigned upload URL for profile
 * images in the public application flow.
 */
export const POST = withApi(async (request) => {
  enforceRateLimit(`public:image-presign:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });

  await resolvePublicWorkspace(request, "applications:write");

  const parsed = imageUploadRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid upload request.");
  }

  const key = createPublicApplicationImageStorageKey(parsed.data.filename);
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
