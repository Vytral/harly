import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { CanonicalInboundEmail } from "@harly/emails";

import {
  applications,
  candidates,
  db,
  jobs,
  mailAttachments,
} from "@harly/db";

import { createLogger } from "@/lib/logger";
import { validateMailboxAttachment } from "@/lib/mailbox/attachments";
import { storage } from "@/lib/storage";
import { notifyInboundEmail } from "@/server/notify/inbox";
import {
  insertCanonicalMessage,
  legacyMailFingerprint,
} from "@/lib/mail/canonical";

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
  messageKey: string,
): Promise<AttachmentMeta[]> {
  const stored: AttachmentMeta[] = [];

  for (const attachment of email.attachments) {
    // Public email senders are untrusted: validate size, content type and
    // sanitize the filename before it ever reaches storage (mirrors the IMAP
    // mailbox path). Without this, anyone could drive unbounded storage writes
    // or smuggle a hostile filename into the object key.
    const validation = validateMailboxAttachment({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.content.length,
    });
    if (!validation.ok) {
      log.warn(
        { filename: attachment.filename, reason: validation.error },
        "inbound attachment rejected",
      );
      continue;
    }

    const key = `inbound/${workspaceId}/${applicationId}/${messageKey}/${validation.filename}`;
    const upload = await storage.getPresignedUploadUrl({
      key,
      contentType: validation.contentType,
      contentLength: attachment.content.length,
    });

    try {
      const putResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": validation.contentType },
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
      filename: validation.filename,
      contentType: validation.contentType,
      size: attachment.content.length,
      storageKey: key,
    });
  }

  return stored;
}

async function persistInboundAttachments(input: {
  workspaceId: string;
  applicationId: string;
  messageId: string;
  messageKey: string;
  email: CanonicalInboundEmail;
}) {
  if (input.email.attachments.length === 0) return;
  const attachments = await storeAttachments(
    input.workspaceId,
    input.applicationId,
    input.email,
    input.messageKey,
  );
  if (attachments.length === 0) return;

  // Provider retries can arrive after the canonical message was committed but
  // before attachment storage finished. Reconcile only missing deterministic
  // keys so a retry repairs the message without duplicating its attachments.
  const existing = await db
    .select({ storageKey: mailAttachments.storageKey })
    .from(mailAttachments)
    .where(
      and(
        eq(mailAttachments.workspaceId, input.workspaceId),
        eq(mailAttachments.messageId, input.messageId),
      ),
    )
    .limit(1_000);
  const existingKeys = new Set(existing.map((attachment) => attachment.storageKey));
  const missing = attachments.filter(
    (attachment) => !existingKeys.has(attachment.storageKey),
  );
  if (missing.length > 0) {
    await db.insert(mailAttachments).values(
      missing.map((attachment) => ({
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        ...attachment,
      })),
    );
  }
}

/**
 * Route a canonical inbound email to the application it's replying to (via
 * the reply+{token} plus-address Harly puts in Reply-To on outbound sends)
 * and record it on the candidate's timeline. Emails that don't match any
 * known token are logged and dropped , there's nowhere in the product to
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
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      candidateFirstName: candidates.firstName,
      candidateLastName: candidates.lastName,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.inboundToken, token),
        eq(applications.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!application) {
    log.warn({ token }, "inbound email: no application matches token, dropping");
    return;
  }

  const messageId =
    email.messageId ||
    legacyMailFingerprint({
      workspaceId,
      candidateId: application.candidateId,
      applicationId: application.id,
      direction: "inbound",
      fromEmail: email.from,
      toEmails: email.to,
      subject: email.subject,
      body: email.textBody,
      createdAt: email.receivedAt,
    });
  const inserted = await insertCanonicalMessage({
    workspaceId,
    source: "legacy-webhook",
    candidateId: application.candidateId,
    applicationId: application.id,
    subject: email.subject,
    participantEmail: email.from,
    inReplyTo: email.inReplyTo,
    references: email.references?.join(" ") ?? null,
    receivedAt: email.receivedAt,
    messageId,
    direction: "inbound",
    fromEmail: email.from,
    toEmails: email.to,
    textBody: email.textBody,
  });

  if (inserted.duplicate) {
    await persistInboundAttachments({
      workspaceId,
      applicationId: application.id,
      messageId: inserted.messageId,
      messageKey: messageId,
      email,
    });
    log.info({ messageId }, "inbound email: duplicate skipped");
    return;
  }

  await persistInboundAttachments({
    workspaceId,
    applicationId: application.id,
    messageId: inserted.messageId,
    messageKey: messageId,
    email,
  });

  // A notification failure must never make a verified provider retry the
  // inbound message. The reply is already durable at this point.
  const candidateName = [application.candidateFirstName, application.candidateLastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim() || email.from;

  void notifyInboundEmail({
    workspaceId,
    jobId: application.jobId,
    candidateId: application.candidateId,
    candidateName,
    subject: email.subject,
    messageId,
    threadId: inserted.threadId,
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/dashboard/candidates/${application.candidateId}`);
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/replies");
  revalidatePath("/dashboard", "layout");
}
