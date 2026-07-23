import "server-only";

import { createElement } from "react";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { applications, candidates, db, mailIdempotencyKeys, mailUnificationMigrations } from "@harly/db";
import { getWorkspaceEmailSender } from "@/lib/email";
import { insertCanonicalMessage, type CanonicalAttachment, type MailSource } from "./canonical";
import { isMailUnificationEnabled } from "./feature-flag";
import { createLogger } from "@/lib/logger";

const log = createLogger("canonical-mail-send");

export type SendCanonicalEmailInput = {
  workspaceId: string;
  idempotencyKey: string;
  candidateId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  attachments?: CanonicalAttachment[];
  inReplyTo?: string | null;
  references?: string | null;
  authorId?: string | null;
  sourceHint?: "provider" | "smtp";
  replyTo?: string | null;
};

export type SendCanonicalEmailResult = {
  delivered: boolean;
  threadId: string;
  messageId: string;
  mailMessageId?: string;
  providerMessageId?: string | null;
  idempotentReplay?: boolean;
  legacyWriteWarning?: string;
};

function payloadHash(input: SendCanonicalEmailInput) {
  return createHash("sha256").update(JSON.stringify({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId ?? null,
    applicationId: input.applicationId ?? null,
    threadId: input.threadId ?? null,
    toEmail: input.toEmail.trim().toLowerCase(),
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? null,
  })).digest("hex");
}

async function reserve(input: SendCanonicalEmailInput, hash: string) {
  const generatedMessageId = `<${randomUUID()}@harly.local>`;
  const [created] = await db.insert(mailIdempotencyKeys).values({
    workspaceId: input.workspaceId,
    idempotencyKey: input.idempotencyKey,
    messageId: generatedMessageId,
    payloadHash: hash,
    status: "pending",
  }).onConflictDoNothing({ target: [mailIdempotencyKeys.workspaceId, mailIdempotencyKeys.idempotencyKey] })
    .returning();
  if (created) return { row: created, replay: false };
  const [existing] = await db.select().from(mailIdempotencyKeys).where(and(
    eq(mailIdempotencyKeys.workspaceId, input.workspaceId),
    eq(mailIdempotencyKeys.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (!existing) throw new Error("Unable to reserve mail idempotency key.");
  if (existing.payloadHash !== hash) throw new Error("Idempotency key was reused with a different payload.");
  if (existing.status === "sent") return { row: existing, replay: true };
  if (existing.status === "sending" || existing.status === "unknown") {
    throw new Error(`Mail delivery is already ${existing.status}; reconcile before retrying.`);
  }
  const [claimed] = await db.update(mailIdempotencyKeys).set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(mailIdempotencyKeys.id, existing.id), eq(mailIdempotencyKeys.status, existing.status))).returning();
  if (!claimed) throw new Error("Mail delivery is already being processed.");
  return { row: claimed, replay: false };
}

async function writeLegacy(input: SendCanonicalEmailInput, messageId: string, mailMessageId: string) {
  if (!input.candidateId) return undefined;
  try {
    const { candidateMessages } = await import("@harly/db");
    const [legacy] = await db.insert(candidateMessages).values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      applicationId: input.applicationId ?? null,
      authorId: input.authorId ?? null,
      direction: "outbound",
      toEmail: input.toEmail,
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      subject: input.subject,
      body: input.textBody,
      providerMessageId: messageId,
      inReplyTo: input.inReplyTo ?? null,
      references: input.references ?? null,
      attachments: input.attachments?.map(({ filename, contentType, size, storageKey }) => ({ filename, contentType, size: size ?? 0, storageKey: storageKey ?? "" })) ?? null,
    }).onConflictDoNothing().returning({ id: candidateMessages.id });
    if (legacy) {
      await db.insert(mailUnificationMigrations).values({
        workspaceId: input.workspaceId,
        candidateMessageId: legacy.id,
        mailMessageId,
        fingerprint: messageId,
        status: "migrated",
      }).onConflictDoNothing();
    }
    return undefined;
  } catch (error) {
    log.warn({ error, workspaceId: input.workspaceId }, "canonical mail legacy dual-write failed");
    return "Canonical mail delivered, but the legacy candidate message could not be written.";
  }
}

export async function sendCanonicalEmail(input: SendCanonicalEmailInput): Promise<SendCanonicalEmailResult> {
  const enabled = await isMailUnificationEnabled(input.workspaceId);
  if (!enabled) throw new Error("Canonical mail sending is not enabled for this workspace.");
  if (input.candidateId) {
    const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, input.candidateId), eq(candidates.workspaceId, input.workspaceId))).limit(1);
    if (!candidate) throw new Error("Candidate does not belong to this workspace.");
  }
  if (input.applicationId) {
    const [application] = await db.select({ id: applications.id, candidateId: applications.candidateId }).from(applications).where(and(eq(applications.id, input.applicationId), eq(applications.workspaceId, input.workspaceId))).limit(1);
    if (!application || (input.candidateId && application.candidateId !== input.candidateId)) throw new Error("Application does not belong to this workspace or candidate.");
  }
  const hash = payloadHash(input);
  const reservation = await reserve(input, hash);
  const row = reservation.row;
  if (reservation.replay) return {
    delivered: true,
    threadId: row.threadId ?? "",
    messageId: row.messageId,
    mailMessageId: row.mailMessageId ?? undefined,
    providerMessageId: row.providerMessageId,
    idempotentReplay: true,
  };

  try {
    if (row.status === "pending") {
      const [sending] = await db.update(mailIdempotencyKeys).set({ status: "sending", updatedAt: new Date() })
        .where(and(eq(mailIdempotencyKeys.id, row.id), eq(mailIdempotencyKeys.status, "pending"))).returning();
      if (!sending) throw new Error("Mail delivery is already being processed.");
    }
    const sender = await getWorkspaceEmailSender(input.workspaceId);
    if (!sender) throw new Error("Email sending is not configured.");
    const provider = await sender.send({
      to: input.toEmail,
      subject: input.subject,
      react: input.htmlBody
        ? createElement("div", { dangerouslySetInnerHTML: { __html: input.htmlBody } })
        : createElement("div", { style: { whiteSpace: "pre-wrap", fontFamily: "sans-serif" } }, input.textBody),
      replyTo: input.replyTo ?? undefined,
      messageId: row.messageId,
      idempotencyKey: input.idempotencyKey,
      attachments: input.attachments,
    });
    const canonical = await insertCanonicalMessage({
      ...input,
      source: input.sourceHint ?? "provider" as MailSource,
      mailboxId: null,
      messageId: row.messageId,
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [input.toEmail],
      direction: "outbound",
      receivedAt: new Date(),
      readAt: new Date(),
    });
    const legacyWriteWarning = await writeLegacy(input, row.messageId, canonical.messageId);
    await db.update(mailIdempotencyKeys).set({ status: "sent", threadId: canonical.threadId, mailMessageId: canonical.messageId, providerMessageId: provider.messageId ?? row.messageId, updatedAt: new Date() }).where(eq(mailIdempotencyKeys.id, row.id));
    return { delivered: true, threadId: canonical.threadId, messageId: row.messageId, mailMessageId: canonical.messageId, providerMessageId: provider.messageId ?? null, legacyWriteWarning };
  } catch (error) {
    await db.update(mailIdempotencyKeys).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : "delivery failed", updatedAt: new Date() }).where(eq(mailIdempotencyKeys.id, row.id));
    throw error;
  }
}
