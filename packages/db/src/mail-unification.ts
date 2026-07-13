import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  candidateMessages,
  mailAttachments,
  mailMessages,
  mailThreads,
  mailUnificationMigrations,
} from "./schema";
import { db } from "./client";

function normalizeSubject(subject: string) {
  return subject
    .trim()
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase() || "(no subject)";
}

function normalizeBody(body: string) {
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
    subject: normalizeSubject(input.subject),
    body: normalizeBody(input.body),
    createdAt: new Date(Math.floor(input.createdAt.getTime() / 60_000) * 60_000).toISOString(),
  };
  return `legacy:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export type MailUnificationItemStatus = "migrated" | "already-migrated" | "ambiguous" | "orphan";

export type MailUnificationReport = {
  total: number;
  migratable: number;
  migrated: number;
  alreadyMigrated: number;
  ambiguous: number;
  orphan: number;
  withoutMessageId: number;
  attachments: { reusable: number; problematic: number };
  errors: Array<{ candidateMessageId: string; status: MailUnificationItemStatus; error: string }>;
};

type LegacyAttachment = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};

function parseAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is LegacyAttachment =>
      typeof item === "object" &&
      item !== null &&
      typeof item.filename === "string" &&
      typeof item.contentType === "string" &&
      typeof item.size === "number" &&
      typeof item.storageKey === "string",
  );
}

function emptyReport(): MailUnificationReport {
  return {
    total: 0,
    migratable: 0,
    migrated: 0,
    alreadyMigrated: 0,
    ambiguous: 0,
    orphan: 0,
    withoutMessageId: 0,
    attachments: { reusable: 0, problematic: 0 },
    errors: [],
  };
}

export async function migrateMailUnification(input: {
  workspaceId?: string;
  dryRun?: boolean;
} = {}): Promise<MailUnificationReport> {
  const report = emptyReport();
  const legacyRows = await db
    .select()
    .from(candidateMessages)
    .where(input.workspaceId ? eq(candidateMessages.workspaceId, input.workspaceId) : undefined)
    .orderBy(desc(candidateMessages.createdAt));
  report.total = legacyRows.length;

  const fingerprints = new Map<string, string>();
  for (const row of legacyRows) {
    const toEmails = [row.toEmail];
    const messageKey = row.providerMessageId || legacyMailFingerprint({
      workspaceId: row.workspaceId,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
      direction: row.direction,
      fromEmail: row.fromEmail,
      toEmails,
      subject: row.subject,
      body: row.body,
      createdAt: row.createdAt,
    });
    if (!row.providerMessageId) report.withoutMessageId += 1;
    const previous = fingerprints.get(messageKey);
    if (previous && previous !== row.id) {
      report.ambiguous += 1;
      report.errors.push({ candidateMessageId: row.id, status: "ambiguous", error: `Fingerprint also belongs to ${previous}.` });
      continue;
    }
    fingerprints.set(messageKey, row.id);

    const attachments = parseAttachments(row.attachments);
    const problematicAttachments = attachments.filter((attachment) => attachment.storageKey.trim() === "");
    report.attachments.reusable += attachments.length - problematicAttachments.length;
    report.attachments.problematic += problematicAttachments.length;

    const [mapping] = await db
      .select({ id: mailUnificationMigrations.id })
      .from(mailUnificationMigrations)
      .where(and(eq(mailUnificationMigrations.workspaceId, row.workspaceId), eq(mailUnificationMigrations.candidateMessageId, row.id)))
      .limit(1);
    if (mapping) {
      report.alreadyMigrated += 1;
      continue;
    }

    const [existing] = await db
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(and(eq(mailMessages.workspaceId, row.workspaceId), eq(mailMessages.messageId, messageKey)))
      .limit(1);
    if (existing) {
      if (!input.dryRun) {
        await db.insert(mailUnificationMigrations).values({
          workspaceId: row.workspaceId,
          candidateMessageId: row.id,
          mailMessageId: existing.id,
          fingerprint: messageKey,
          status: "migrated",
        });
      }
      report.alreadyMigrated += 1;
      continue;
    }

    report.migratable += 1;
    if (input.dryRun) continue;

    try {
      const [thread] = await db
        .select({ id: mailThreads.id, conversationId: mailThreads.conversationId })
        .from(mailThreads)
        .where(and(
          eq(mailThreads.workspaceId, row.workspaceId),
          eq(mailThreads.source, "legacy-webhook"),
          isNull(mailThreads.mailboxId),
          eq(mailThreads.candidateId, row.candidateId),
          row.applicationId ? eq(mailThreads.applicationId, row.applicationId) : undefined,
          eq(mailThreads.normalizedSubject, normalizeSubject(row.subject)),
          row.fromEmail ? eq(mailThreads.participantEmail, row.fromEmail) : isNull(mailThreads.participantEmail),
          eq(mailThreads.status, "open"),
        )).orderBy(desc(mailThreads.lastMessageAt)).limit(1);
      const threadId = thread?.id ?? (await db.insert(mailThreads).values({
        workspaceId: row.workspaceId,
        source: "legacy-webhook",
        mailboxId: null,
        conversationId: randomUUID(),
        subject: row.subject || "(No subject)",
        normalizedSubject: normalizeSubject(row.subject),
        participantEmail: row.fromEmail,
        candidateId: row.candidateId,
        applicationId: row.applicationId,
        lastMessageAt: row.createdAt,
      }).returning({ id: mailThreads.id }))[0].id;
      const [message] = await db.insert(mailMessages).values({
        workspaceId: row.workspaceId,
        threadId,
        candidateId: row.candidateId,
        applicationId: row.applicationId,
        messageId: messageKey,
        inReplyTo: row.inReplyTo,
        references: row.references,
        direction: row.direction,
        fromEmail: row.fromEmail ?? row.toEmail,
        toEmails,
        subject: row.subject,
        textBody: row.body,
        receivedAt: row.createdAt,
        readAt: row.readAt,
      }).returning({ id: mailMessages.id });
      if (attachments.length > 0) {
        const validAttachments = attachments.filter((attachment) => attachment.storageKey.trim() !== "");
        if (validAttachments.length > 0) {
          await db.insert(mailAttachments).values(validAttachments.map((attachment) => ({
            workspaceId: row.workspaceId,
            messageId: message.id,
            ...attachment,
          })));
        }
      }
      await db.insert(mailUnificationMigrations).values({
        workspaceId: row.workspaceId,
        candidateMessageId: row.id,
        mailMessageId: message.id,
        fingerprint: messageKey,
        status: "migrated",
        error: problematicAttachments.length > 0 ? "One or more attachments had an invalid storage key." : null,
      });
      report.migrated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown migration error";
      report.orphan += 1;
      report.errors.push({ candidateMessageId: row.id, status: "orphan", error: message });
      await db.insert(mailUnificationMigrations).values({
        workspaceId: row.workspaceId,
        candidateMessageId: row.id,
        fingerprint: messageKey,
        status: "orphan",
        error: message.slice(0, 1000),
      }).onConflictDoNothing();
    }
  }
  return report;
}
