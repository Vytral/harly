import { NextResponse, type NextRequest } from "next/server";
import { db, activityEvents } from "@harly/db";

import { getDocumentAccess } from "@/features/documents/data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const context = await requirePermission("documents:read");
    const { documentId } = await params;
    const access = await getDocumentAccess(documentId, {
      workspaceId: context.organization.id,
      userId: context.user.id,
      roleKey: context.roleKey,
    });
    if (!access || access.document.status === "archived") return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const bytes = await storage.read(access.document.storageKey);
    await db.insert(activityEvents).values({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      entityType: "document",
      entityId: access.document.id,
      type: request.nextUrl.searchParams.get("download") === "1" ? "document.downloaded" : "document.viewed",
      metadata: { name: access.document.name },
    });
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": access.document.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(access.document.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
