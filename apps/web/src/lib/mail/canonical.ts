import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  db,
  mailAttachments,
  mailMessages,
  mailThreads,
  type NewMailMessage,
} from "@harly/db";

export type MailSource = "imap" | "legacy-webhook" | "provider" | "smtp";

export type CanonicalAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
  size?: number;
  storageKey?: string;
};

export type CanonicalThreadInput = {
  workspaceId: string;
  threadId?: string | null;
  source: MailSource;
  mailboxId?: string | null;
  subject: string;
  participantEmail?: string | null;
  candidateId?: string | null;
  applicationId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  receivedAt: Date;
};

export type CanonicalMessageInput = CanonicalThreadInput & {
  messageId?: string | null;
  imapUid?: number | null;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmails: string[];
  textBody: string;
  htmlBody?: string | null;
  readAt?: Date | null;
  attachments?: CanonicalAttachment[];
};

export function normalizeMailSubject(subject: string) {
  return subject
    .trim()
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase() || "(no subject)";
}

export function normalizeFingerprintBody(body: string) {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

export function legacyMailFingerprint(input: {
  workspaceId: string;
  candidateId: string;
  applicationId?: string | null;
  direction: "inbound" | "outbound";
  fromEmail?: string | null;
  toEmails: string[];
  subject: string;
  body: string;
  createdAt: Date;
}) {
  const payload = {
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    applicationId: input.applicationId ?? null,
    direction: input.direction,
    fromEmail: input.fromEmail?.trim().toLowerCase() ?? null,
    toEmails: [...new Set(input.toEmails.map((email) => email.trim().toLowerCase()))].sort(),
    subject: normalizeMailSubject(input.subject),
    body: normalizeFingerprintBody(input.body),
    createdAt: new Date(Math.floor(input.createdAt.getTime() / 60_000) * 60_000).toISOString(),
  };
  const canonical = JSON.stringify(payload);
  return `legacy:${createHash("sha256").update(canonical).digest("hex")}`;
}

function referenceIds(input: Pick<CanonicalThreadInput, "inReplyTo" | "references">) {
  return [input.inReplyTo, ...(input.references ?? "").split(/\s+/)]
    .filter((value): value is string => Boolean(value));
}

async function threadIdForReferences(
  workspaceId: string,
  input: Pick<CanonicalThreadInput, "inReplyTo" | "references">,
) {
  const ids = referenceIds(input);
  if (ids.length === 0) return null;
  const [row] = await db
    .select({ id: mailThreads.id })
    .from(mailMessages)
    .innerJoin(mailThreads, eq(mailThreads.id, mailMessages.threadId))
    .where(and(eq(mailMessages.workspaceId, workspaceId), inArray(mailMessages.messageId, ids)))
    .orderBy(desc(mailMessages.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function findOrCreateCanonicalThread(input: CanonicalThreadInput) {
  if (input.threadId) {
    const [thread] = await db.select({ id: mailThreads.id, conversationId: mailThreads.conversationId })
      .from(mailThreads)
      .where(and(eq(mailThreads.id, input.threadId), eq(mailThreads.workspaceId, input.workspaceId)))
      .limit(1);
    if (!thread) throw new Error("Mail thread does not belong to this workspace.");
    return thread;
  }

  const relatedThreadId = await threadIdForReferences(input.workspaceId, input);
  if (relatedThreadId) {
    const [thread] = await db.select({ id: mailThreads.id, conversationId: mailThreads.conversationId })
      .from(mailThreads).where(eq(mailThreads.id, relatedThreadId)).limit(1);
    if (thread) return thread;
  }

  const [existing] = await db
    .select({ id: mailThreads.id, conversationId: mailThreads.conversationId })
    .from(mailThreads)
    .where(
      and(
        eq(mailThreads.workspaceId, input.workspaceId),
        input.candidateId && input.applicationId ? eq(mailThreads.candidateId, input.candidateId) : sql`false`,
        input.applicationId ? eq(mailThreads.applicationId, input.applicationId) : sql`false`,
        eq(mailThreads.normalizedSubject, normalizeMailSubject(input.subject)),
        eq(mailThreads.status, "open"),
      ),
    )
    .orderBy(desc(mailThreads.lastMessageAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(mailThreads)
    .values({
      workspaceId: input.workspaceId,
      mailboxId: input.mailboxId ?? null,
      source: input.source,
      conversationId: randomUUID(),
      subject: input.subject || "(No subject)",
      normalizedSubject: normalizeMailSubject(input.subject),
      participantEmail: input.participantEmail ?? null,
      candidateId: input.candidateId ?? null,
      applicationId: input.applicationId ?? null,
      lastMessageAt: input.receivedAt,
    })
    .returning({ id: mailThreads.id, conversationId: mailThreads.conversationId });
  return created;
}

export async function insertCanonicalMessage(input: CanonicalMessageInput) {
  const existing = input.messageId
    ? (await db.select({ id: mailMessages.id, threadId: mailMessages.threadId })
        .from(mailMessages)
        .where(and(eq(mailMessages.workspaceId, input.workspaceId), eq(mailMessages.messageId, input.messageId)))
        .limit(1))[0]
    : undefined;
  if (existing) return { messageId: existing.id, threadId: existing.threadId, duplicate: true };

  const thread = await findOrCreateCanonicalThread(input);
  const values: NewMailMessage = {
    workspaceId: input.workspaceId,
    threadId: thread.id,
    candidateId: input.candidateId ?? null,
    applicationId: input.applicationId ?? null,
    imapUid: input.imapUid ?? null,
    messageId: input.messageId ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? null,
    direction: input.direction,
    fromEmail: input.fromEmail,
    toEmails: input.toEmails,
    subject: input.subject || "(No subject)",
    textBody: input.textBody,
    htmlBody: input.htmlBody ?? null,
    receivedAt: input.receivedAt,
    readAt: input.readAt ?? null,
  };

  const insert = db.insert(mailMessages).values(values);
  const createdRows = input.messageId
    ? await insert
        .onConflictDoNothing({
          target: [mailMessages.workspaceId, mailMessages.messageId],
        })
        .returning({ id: mailMessages.id, threadId: mailMessages.threadId })
    : await insert.returning({ id: mailMessages.id, threadId: mailMessages.threadId });
  const [created] = createdRows;
  if (!created) {
    return { messageId: input.messageId ?? "", threadId: thread.id, duplicate: true };
  }
  if (input.attachments?.length) {
    await db.insert(mailAttachments).values(input.attachments.map((attachment) => ({
      workspaceId: input.workspaceId,
      messageId: created.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size ?? attachment.content.byteLength,
      storageKey: attachment.storageKey ?? `mail-inline:${created.id}:${attachment.filename}`,
    })));
  }
  await db
    .update(mailThreads)
    .set({
      lastMessageAt: input.receivedAt,
      ...(input.direction === "inbound" && !input.readAt
        ? { unreadCount: sql`${mailThreads.unreadCount} + 1` }
        : {}),
    })
    .where(eq(mailThreads.id, thread.id));
  return { messageId: created.id, threadId: created.threadId, duplicate: false };
}
