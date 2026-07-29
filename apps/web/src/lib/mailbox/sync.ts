import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getLocalUploadPath } from "@harly/storage";

import { candidates, db, mailAttachments, mailMessages, mailThreads, mailboxes, sql as postgresSql } from "@harly/db";

import { getMailboxConfig } from "@/lib/mailbox/config";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { validateMailboxAttachment } from "@/lib/mailbox/attachments";

const log = createLogger("mailbox-sync");

export function normalizeSubject(subject: string) {
  return subject.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim().toLowerCase() || "(no subject)";
}

function address(value: unknown) {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object") return "";
  const addresses = "value" in item ? (item as { value?: Array<{ address?: string }> }).value : undefined;
  return addresses?.[0]?.address?.toLowerCase() ?? "";
}

function addresses(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => item && typeof item === "object" && "value" in item ? ((item as { value?: Array<{ address?: string }> }).value ?? []).map((entry) => entry.address).filter((entry): entry is string => Boolean(entry)) : []);
}

async function uploadAttachment(workspaceId: string, messageId: string, attachment: { filename?: string; contentType?: string; content: Buffer }) {
  const validation = validateMailboxAttachment({
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.content.length,
  });
  if (!validation.ok) throw new Error(validation.error);
  const { filename, contentType } = validation;
  const key = `mailboxes/${workspaceId}/${messageId}/${filename}`;
  if ((process.env.STORAGE_PROVIDER ?? "local") === "local") {
    const target = getLocalUploadPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, attachment.content);
    return { filename, contentType, size: attachment.content.length, storageKey: key };
  }
  const upload = await storage.getPresignedUploadUrl({ key, contentType, contentLength: attachment.content.length });
  const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(attachment.content).buffer });
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  return { filename, contentType, size: attachment.content.length, storageKey: key };
}

async function findOrCreateThread(input: { workspaceId: string; mailboxId: string; subject: string; participantEmail: string; inReplyTo?: string | null; references?: string | null; receivedAt: Date }) {
  const referenceIds = [input.inReplyTo, ...(input.references ?? "").split(/\s+/)].filter(Boolean) as string[];
  const referenced = referenceIds.length
    ? await db
        .select({ threadId: mailMessages.threadId, source: mailThreads.source, conversationId: mailThreads.conversationId })
        .from(mailMessages)
        .innerJoin(
          mailThreads,
          and(
            eq(mailThreads.id, mailMessages.threadId),
            eq(mailThreads.workspaceId, input.workspaceId),
          ),
        )
        .where(
          and(
            eq(mailMessages.workspaceId, input.workspaceId),
            or(...referenceIds.map((id) => eq(mailMessages.messageId, id))),
          ),
        )
        .limit(1)
    : [];
  const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.workspaceId, input.workspaceId), eq(candidates.email, input.participantEmail), isNull(candidates.deletedAt))).limit(1);
  if (referenced[0]?.source === "imap") return referenced[0].threadId;
  const normalizedSubject = normalizeSubject(input.subject);
  const [matching] = await db
    .select({ id: mailThreads.id })
    .from(mailThreads)
    .where(
      and(
        eq(mailThreads.workspaceId, input.workspaceId),
        eq(mailThreads.mailboxId, input.mailboxId),
        eq(mailThreads.normalizedSubject, normalizedSubject),
        eq(mailThreads.participantEmail, input.participantEmail),
        eq(mailThreads.status, "open"),
      ),
    )
    .orderBy(desc(mailThreads.lastMessageAt))
    .limit(1);
  if (matching) return matching.id;
  const [thread] = await db.insert(mailThreads).values({ workspaceId: input.workspaceId, mailboxId: input.mailboxId, source: "imap", conversationId: referenced[0]?.conversationId, subject: input.subject || "(No subject)", normalizedSubject, participantEmail: input.participantEmail || null, candidateId: candidate?.id ?? null, lastMessageAt: input.receivedAt }).returning({ id: mailThreads.id });
  return thread.id;
}

async function syncMailboxOnce(workspaceId: string): Promise<{ imported: number; skipped: number }> {
  const config = await getMailboxConfig(workspaceId);
  if (!config) return { imported: 0, skipped: 0 };
  const client = new ImapFlow({ host: config.imap.host, port: config.imap.port, secure: config.imap.tls, auth: { user: config.imap.user, pass: config.imap.password }, logger: false });
  let imported = 0; let skipped = 0;
  let nonFatalError: string | null = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.imap.folder);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("IMAP source folder could not be opened.");
      const uidValidity = String(mailbox.uidValidity ?? "");
      const since = config.uidValidity === uidValidity ? config.lastUid + 1 : 1;
      for await (const message of client.fetch(`${since}:*`, { uid: true, source: true, flags: true })) {
        if (!message.uid || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const messageId = parsed.messageId?.trim() || null;
        const [duplicate] = await db
          .select({ id: mailMessages.id })
          .from(mailMessages)
          .innerJoin(
            mailThreads,
            and(
              eq(mailThreads.id, mailMessages.threadId),
              eq(mailThreads.workspaceId, workspaceId),
            ),
          )
          .where(
            and(
              eq(mailMessages.workspaceId, workspaceId),
              or(
                and(eq(mailThreads.mailboxId, config.id), eq(mailMessages.imapUid, message.uid)),
                ...(messageId ? [eq(mailMessages.messageId, messageId)] : []),
              ),
            ),
          )
          .limit(1);
        if (duplicate) { skipped++; continue; }
        const receivedAt = parsed.date ?? new Date();
        const fromEmail = address(parsed.from) || "unknown@unknown";
        const participant = fromEmail === config.address.toLowerCase() ? address(parsed.to) : fromEmail;
        const references = Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references ?? null;
        const threadId = await findOrCreateThread({ workspaceId, mailboxId: config.id, subject: parsed.subject ?? "", participantEmail: participant, inReplyTo: parsed.inReplyTo, references, receivedAt });
        const [saved] = await db.insert(mailMessages).values({ workspaceId, threadId, imapUid: message.uid, messageId, inReplyTo: parsed.inReplyTo ?? null, references, direction: "inbound", fromEmail, toEmails: addresses(parsed.to), subject: parsed.subject ?? "(No subject)", textBody: parsed.text ?? "", htmlBody: parsed.html || null, receivedAt, readAt: message.flags?.has("\\Seen") ? receivedAt : null }).returning({ id: mailMessages.id });
        const storedAttachments: Array<Awaited<ReturnType<typeof uploadAttachment>>> = [];
        try {
          for (const attachment of parsed.attachments) {
            storedAttachments.push(await uploadAttachment(workspaceId, saved.id, attachment));
          }
          if (storedAttachments.length > 0) {
            await db.insert(mailAttachments).values(
              storedAttachments.map((stored) => ({ workspaceId, messageId: saved.id, ...stored })),
            );
          }
        } catch (error) {
          await Promise.allSettled(storedAttachments.map(({ storageKey }) => storage.delete(storageKey)));
          nonFatalError = error instanceof Error ? `Attachment sync failed: ${error.message.slice(0, 900)}` : "Attachment sync failed.";
          log.warn({ messageId: saved.id, error: nonFatalError }, "mail attachment could not be stored; message was kept");
        }
        await db
          .update(mailThreads)
          .set({ lastMessageAt: receivedAt, ...(message.flags?.has("\\Seen") ? {} : { unreadCount: sql`${mailThreads.unreadCount} + 1` }) })
          .where(
            and(
              eq(mailThreads.id, threadId),
              eq(mailThreads.workspaceId, workspaceId),
            ),
          );
        imported++;
      }
      await db.update(mailboxes).set({ uidValidity, lastUid: mailbox.uidNext ? mailbox.uidNext - 1 : config.lastUid, lastSyncedAt: new Date(), lastHealthyAt: new Date(), lastError: nonFatalError }).where(eq(mailboxes.id, config.id));
    } finally { lock.release(); }
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 1000) : "Mailbox synchronization failed";
    await db.update(mailboxes).set({ lastError }).where(eq(mailboxes.id, config.id));
    throw error;
  } finally { await client.logout().catch(() => undefined); }
  return { imported, skipped };
}

/** Prevent settings actions and scheduler replicas from syncing one workspace concurrently. */
export async function syncMailbox(workspaceId: string): Promise<{ imported: number; skipped: number }> {
  const digest = createHash("sha256").update(`mailbox:${workspaceId}`).digest();
  const keyHi = digest.readInt32BE(0);
  const keyLo = digest.readInt32BE(4);
  const connection = await postgresSql.reserve();
  try {
    const [row] = await connection`
      select pg_try_advisory_lock(${keyHi}, ${keyLo}) as locked
    `;
    if (!row?.locked) return { imported: 0, skipped: 0 };
    try {
      return await syncMailboxOnce(workspaceId);
    } finally {
      await connection`select pg_advisory_unlock(${keyHi}, ${keyLo})`;
    }
  } finally {
    connection.release();
  }
}
