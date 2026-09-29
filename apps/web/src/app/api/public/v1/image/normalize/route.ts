import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeStoredWorkspaceImage, StoredImageNotFoundError } from "@/lib/normalize-stored-image";
import { UnsupportedImageError } from "@/lib/image-normalization";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { withApi } from "@/server/api/respond";

export const runtime = "nodejs";

const requestSchema = z.object({
  key: z.string().min(1).max(512),
});

export const POST = withApi(async (request) => {
  await enforceRateLimit(`public:image-normalize:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });

  const workspace = await resolvePublicWorkspace(request, "applications:write");
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid image request." }, { status: 400 });
  }

  try {
    const result = await normalizeStoredWorkspaceImage({
      workspaceId: workspace.workspaceId,
      key: parsed.data.key,
      mode: "image",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StoredImageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof UnsupportedImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not process the image." }, { status: 422 });
  }
}, { cors: true });
