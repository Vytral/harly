import { ApiError } from "@harly/api";

import {
  createPublicApplicationImageStorageKey,
  imageUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage, storageProvider } from "@/lib/storage";
import { appendStorageUploadIntent, createStorageUploadIntent } from "@/lib/storage-upload-intent";
import { toHarlyPublicUrl } from "@/lib/public-origin";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/**
 * POST /api/public/v1/image/presign , public presigned upload URL for profile
 * images in the public application flow.
 */
export const POST = withApi(async (request) => {
  enforceRateLimit(`public:image-presign:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });

  const workspace = await resolvePublicWorkspace(request, "applications:write");

  const parsed = imageUploadRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid upload request.");
  }

  const key = createPublicApplicationImageStorageKey(workspace.workspaceId, parsed.data.filename);
  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  const intent = createStorageUploadIntent({ workspaceId: workspace.workspaceId, key, contentType: parsed.data.contentType, contentLength: parsed.data.contentLength, expiresAt: Date.now() + 10 * 60_000 });
  return apiOk({ ...result, uploadUrl: storageProvider === "local" ? toHarlyPublicUrl(appendStorageUploadIntent(result.uploadUrl, intent)) : result.uploadUrl, key }, { cors: true });
}, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
