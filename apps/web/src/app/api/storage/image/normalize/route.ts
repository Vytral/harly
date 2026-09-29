import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
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
  const appWorkspaceId = context?.organization.id;
  let portalSession: Awaited<ReturnType<typeof resolvePortalSession>> = null;
  if (!appWorkspaceId || keyWorkspaceId !== appWorkspaceId) {
    const portalToken = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
    if (portalToken) portalSession = await resolvePortalSession(portalToken);
  }
  const workspaceId =
    appWorkspaceId === keyWorkspaceId
      ? appWorkspaceId
      : portalSession?.workspaceId === keyWorkspaceId
        ? (portalSession?.workspaceId ?? null)
        : null;
  if (!workspaceId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const result = await normalizeStoredWorkspaceImage({
      workspaceId,
      ...parsed.data,
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
