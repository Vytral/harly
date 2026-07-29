import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceMailboxAttachment } from "@/lib/mailbox/attachment-access";
import { storage } from "@/lib/storage";
import { logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

/** Authenticated, workspace-scoped download for IMAP Inbox attachments. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    await requirePermission("collab:write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { attachmentId } = await params;
  const { organization, user } = await getWorkspaceContext();
  const attachment = await getWorkspaceMailboxAttachment({
    attachmentId,
    workspaceId: organization.id,
  });
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

  try {
    const content = await storage.read(attachment.storageKey);
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "mailbox.attachment.downloaded",
      resourceType: "mail_attachment",
      resourceId: attachmentId,
      metadata: { filename: attachment.filename, size: attachment.size },
    });
    return new NextResponse(new Uint8Array(content).slice(), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(content.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Attachment is unavailable." }, { status: 404 });
  }
}
