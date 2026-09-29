import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { UnsupportedImageError } from "@/lib/image-normalization";
import {
  normalizeStoredWorkspaceImage,
  StoredImageNotFoundError,
} from "@/lib/normalize-stored-image";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

const requestSchema = z.object({
  key: z.string().min(1).max(512),
  mode: z.enum(["logo", "image"]),
});

/**
 * Normalize an image a workspace member just uploaded, replacing the original.
 *
 * Workspace sessions only. Candidate portal sessions are not accepted: their
 * uploads share the workspace image area (so a portal caller could name a
 * workspace logo), and candidate erasure tracks recorded avatar URLs, not the
 * upload key, so a retained original would escape erasure.
 */
export async function POST(request: NextRequest) {
  await enforceRateLimit(`storage:image-normalize:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid image request." }, { status: 400 });
  }

  const context = await getWorkspaceContextOrNull();
  const keyWorkspaceId = parsed.data.key.match(/^workspaces\/([^/]+)\/images\//)?.[1];
  const workspaceId = context?.organization.id;
  if (!workspaceId || keyWorkspaceId !== workspaceId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const result = await normalizeStoredWorkspaceImage({
      workspaceId,
      ...parsed.data,
      deleteSource: true,
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
}
