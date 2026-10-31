import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { activityEvents, db, documentVersions } from "@harly/db";

import { getDocumentAccess } from "@/features/documents/data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Download one stored version of a document; same ACL gate as the current-file route. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; versionNumber: string }> },
) {
  try {
    const context = await requirePermission("documents:read");
    const { documentId, versionNumber } = await params;
    const number = Number.parseInt(versionNumber, 10);
    if (!Number.isInteger(number) || number < 1) {
      return NextResponse.json({ error: "Version not found." }, { status: 404 });
    }
    const access = await getDocumentAccess(documentId, {
      workspaceId: context.organization.id,
      userId: context.user.id,
      roleKey: context.roleKey,
    });
    if (!access || access.document.status === "archived") {
      return NextResponse.json({ error: "Version not found." }, { status: 404 });
    }
    const [version] = await db
      .select({ storageKey: documentVersions.storageKey })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, context.organization.id),
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.versionNumber, number),
        ),
      )
      .limit(1);
    if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    const bytes = await storage.read(version.storageKey);
    await db.insert(activityEvents).values({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      entityType: "document",
      entityId: documentId,
      type: "document.downloaded",
      metadata: { name: access.document.name, version: number },
    });
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": access.document.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`v${number}-${access.document.name}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
}
