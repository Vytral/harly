import "server-only";

import { and, eq } from "drizzle-orm";
import type { CanonicalInboundEmail } from "@harly/emails";

import { applications, candidateMessages, db } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("inbound-email");

const TOKEN_RE = /reply\+([^@]+)@/i;

function extractToken(addresses: string[]): string | null {
  for (const address of addresses) {
    const match = address.match(TOKEN_RE);
    if (match?.[1]) return match[1];
  }
  return null;
}

type AttachmentMeta = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};

async function storeAttachments(
  workspaceId: string,
  applicationId: string,
  email: CanonicalInboundEmail,
): Promise<AttachmentMeta[]> {
  const stored: AttachmentMeta[] = [];

  for (const attachment of email.attachments) {
    const key = `inbound/${workspaceId}/${applicationId}/${email.messageId}/${attachment.filename}`;
    const upload = await storage.getPresignedUploadUrl({
      key,
      contentType: attachment.contentType,
      contentLength: attachment.content.length,
    });

    try {
      const putResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": attachment.contentType },
        body: new Uint8Array(attachment.content).buffer,
      });
      if (!putResponse.ok) {
        log.error(
          { status: putResponse.status },
          "inbound attachment upload failed",
        );
        continue;
      }
    } catch (error) {
      log.error(error, "inbound attachment upload failed");
      continue;
    }

    stored.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.content.length,
      storageKey: key,
    });
  }

  return stored;
}

/**
 * Route a canonical inbound email to the application it's replying to (via
 * the reply+{token} plus-address Harly puts in Reply-To on outbound sends)
 * and record it on the candidate's timeline. Emails that don't match any
 * known token are logged and dropped — there's nowhere in the product to
 * show a message with no candidate/application context.
 */
export async function processInboundEmail(
  email: CanonicalInboundEmail,
  workspaceId: string,
): Promise<void> {
  const token = extractToken(email.to);
  if (!token) {
    log.warn({ to: email.to }, "inbound email: no reply token found, dropping");
    return;
  }

  const [application] = await db
    .select({ id: applications.id, candidateId: applications.candidateId })
    .from(applications)
    .where(eq(applications.inboundToken, token))
    .limit(1);

  if (!application) {
    log.warn({ token }, "inbound email: no application matches token, dropping");
    return;
  }

  // Idempotency: skip if we've already processed this message (provider retries).
  if (email.messageId) {
    const [existing] = await db
      .select({ id: candidateMessages.id })
      .from(candidateMessages)
      .where(
        and(
          eq(candidateMessages.workspaceId, workspaceId),
          eq(candidateMessages.providerMessageId, email.messageId),
        ),
      )
      .limit(1);

    if (existing) {
      log.info(
        { messageId: email.messageId },
        "inbound email: already processed, skipping",
      );
      return;
    }
  }

  const attachments = await storeAttachments(workspaceId, application.id, email);

  await db.insert(candidateMessages).values({
    workspaceId,
    candidateId: application.candidateId,
    applicationId: application.id,
    direction: "inbound",
    toEmail: email.to[0] ?? "",
    fromEmail: email.from,
    subject: email.subject,
    body: email.textBody,
    status: "sent",
    providerMessageId: email.messageId,
    inReplyTo: email.inReplyTo,
    references: email.references?.join(" "),
    attachments: attachments.length > 0 ? attachments : null,
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/dashboard/candidates/${application.candidateId}`);
}
