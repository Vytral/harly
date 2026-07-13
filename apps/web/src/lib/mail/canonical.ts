import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  db,
  mailMessages,
  mailThreads,
  type NewMailMessage,
} from "@harly/db";

export type MailSource = "imap" | "legacy-webhook" | "provider";

export type CanonicalThreadInput = {
  workspaceId: string;
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

async function conversationIdForReferences(
  workspaceId: string,
  input: Pick<CanonicalThreadInput, "inReplyTo" | "references">,
) {
  const ids = referenceIds(input);
  if (ids.length === 0) return null;
  const [row] = await db
    .select({ conversationId: mailThreads.conversationId })
    .from(mailMessages)
    .innerJoin(mailThreads, eq(mailThreads.id, mailMessages.threadId))
    .where(and(eq(mailMessages.workspaceId, workspaceId), inArray(mailMessages.messageId, ids)))
    .orderBy(desc(mailMessages.createdAt))
    .limit(1);
  return row?.conversationId ?? null;
}

export async function findOrCreateCanonicalThread(input: CanonicalThreadInput) {
  const conversationId =
    (await conversationIdForReferences(input.workspaceId, input)) ?? randomUUID();
  const mailboxPredicate = input.mailboxId
    ? eq(mailThreads.mailboxId, input.mailboxId)
    : isNull(mailThreads.mailboxId);

  const [existing] = await db
    .select({ id: mailThreads.id, conversationId: mailThreads.conversationId })
    .from(mailThreads)
    .where(
      and(
        eq(mailThreads.workspaceId, input.workspaceId),
        eq(mailThreads.source, input.source),
        mailboxPredicate,
        input.candidateId ? eq(mailThreads.candidateId, input.candidateId) : undefined,
        input.applicationId ? eq(mailThreads.applicationId, input.applicationId) : undefined,
        eq(mailThreads.normalizedSubject, normalizeMailSubject(input.subject)),
        input.participantEmail
          ? eq(mailThreads.participantEmail, input.participantEmail)
          : isNull(mailThreads.participantEmail),
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
      conversationId,
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

  const [existing] = input.messageId
    ? await db
        .select({ id: mailMessages.id, threadId: mailMessages.threadId })
        .from(mailMessages)
        .where(and(eq(mailMessages.workspaceId, input.workspaceId), eq(mailMessages.messageId, input.messageId)))
        .limit(1)
    : [];
  if (existing) return { messageId: existing.id, threadId: existing.threadId, duplicate: true };

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
