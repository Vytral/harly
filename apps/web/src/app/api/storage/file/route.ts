import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { candidateFiles, db } from "@harly/db";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  PORTAL_SESSION_COOKIE,
  resolvePortalSession,
} from "@/lib/portal-auth";
import { storage } from "@/lib/storage";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function contentTypeFor(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("key");
  const key = requested ? resumeKeyFromUrl(`/api/storage/file?key=${encodeURIComponent(requested)}`) : null;
  if (!key) return new NextResponse("Not found", { status: 404 });

  const workspaceId = key.match(/^workspaces\/([^/]+)\/resumes\//)?.[1];
  if (!workspaceId) return new NextResponse("Not found", { status: 404 });

  const context = await getWorkspaceContextOrNull();
  let allowed = context?.organization.id === workspaceId;

  if (!allowed) {
    const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
    const portal = token ? await resolvePortalSession(token) : null;
    if (portal?.workspaceId === workspaceId) {
      const [owned] = await db
        .select({ id: candidateFiles.id })
        .from(candidateFiles)
        .where(
          and(
            eq(candidateFiles.candidateId, portal.candidateId),
            eq(candidateFiles.workspaceId, workspaceId),
            eq(candidateFiles.fileUrl, `/api/storage/file?key=${encodeURIComponent(key)}`),
          ),
        )
        .limit(1);
      allowed = Boolean(owned);
    }
  }

  if (!allowed) return new NextResponse("Not found", { status: 404 });

  try {
    const file = await storage.read(key);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentTypeFor(key),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
