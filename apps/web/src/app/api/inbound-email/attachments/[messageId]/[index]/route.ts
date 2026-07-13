import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db, mailAttachments } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string; index: string }> },
) {
  try {
    await requirePermission("collab:write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { messageId, index } = await params;
  const attachmentIndex = Number.parseInt(index, 10);
  if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0) {
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  }

  const { organization: workspace } = await getWorkspaceContext();
  const attachments = await db
    .select({
      filename: mailAttachments.filename,
      contentType: mailAttachments.contentType,
      size: mailAttachments.size,
      storageKey: mailAttachments.storageKey,
    })
    .from(mailAttachments)
    .where(
      and(
        eq(mailAttachments.messageId, messageId),
        eq(mailAttachments.workspaceId, workspace.id),
      ),
    )
    .orderBy(asc(mailAttachments.createdAt));

  const attachment = attachments[attachmentIndex];
  if (!attachment) {
    return NextResponse.json(
      { error: "Attachment not found." },
      { status: 404 },
    );
  }

  try {
    const content = await storage.read(attachment.storageKey);
    // Buffer is not part of the browser BodyInit type exposed by Next. Copy it
    // into a Uint8Array so both the runtime and TypeScript agree on the body.
    const body = new Uint8Array(content).slice();
    return new NextResponse(body, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(content.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Attachment is unavailable." },
      { status: 404 },
    );
  }
}
