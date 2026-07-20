"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { applications, candidates, db, mailMessages, mailThreads, member } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getMailboxConfig } from "@/lib/mailbox/config";
import { createLogger } from "@/lib/logger";
import { syncMailbox } from "@/lib/mailbox/sync";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { enforceRateLimit } from "@/server/api/ratelimit";
import { generateMailboxReplyWithAI, generateMailboxSummaryWithAI } from "@/lib/ai/surfaces/mailbox-assistance";
import { logAuditEvent } from "@/lib/audit-log";

const log = createLogger("mailbox");

const threadId = z.string().uuid();
const inboxThread = z.object({
  threadId: z.string(),
  source: z.literal("mailbox"),
});
export async function updateMailboxThreadAction(input: { threadId: string; status?: "open" | "archived" | "spam"; ownerId?: string | null }) {
  const parsed = threadId.safeParse(input.threadId); if (!parsed.success) return { ok: false };
  await requirePermission("collab:write");
  const { organization, user } = await getWorkspaceContext();
  if (input.ownerId) {
    const [assignee] = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, organization.id), eq(member.userId, input.ownerId))).limit(1);
    if (!assignee) return { ok: false, error: "Assignee is not a workspace member." };
  }
  await db.update(mailThreads).set({ ...(input.status ? { status: input.status } : {}), ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}) }).where(and(eq(mailThreads.id, parsed.data), eq(mailThreads.workspaceId, organization.id)));
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: input.status === "archived"
      ? "mailbox.thread.archived"
      : input.status === "spam"
        ? "mailbox.thread.marked_spam"
        : input.ownerId
          ? "mailbox.thread.assigned"
          : input.ownerId === null
            ? "mailbox.thread.unassigned"
            : "mailbox.thread.updated",
    resourceType: "mail_thread",
    resourceId: parsed.data,
    metadata: {
      status: input.status ?? null,
      ownerId: input.ownerId ?? null,
    },
  });
  revalidatePath("/dashboard/inbox"); return { ok: true };
}

/** Link an Inbox thread to one of the same candidate's applications. */
export async function linkMailboxThreadToApplicationAction(input: { threadId: string; applicationId: string | null }) {
  const parsed = z.object({ threadId: z.string().uuid(), applicationId: z.string().uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid thread or application." };
  await requirePermission("candidates:edit");
  const { organization, user } = await getWorkspaceContext();
  const [thread] = await db.select({ candidateId: mailThreads.candidateId }).from(mailThreads).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread?.candidateId) return { ok: false, error: "Create or link a candidate before choosing an application." };
  const application = parsed.data.applicationId
    ? (await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, parsed.data.applicationId), eq(applications.workspaceId, organization.id), eq(applications.candidateId, thread.candidateId))).limit(1))[0]
    : null;
  if (parsed.data.applicationId && !application) return { ok: false, error: "Application does not belong to this candidate." };
  await db.transaction(async (tx) => {
    await tx.update(mailThreads).set({ applicationId: application?.id ?? null }).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id)));
    await tx.update(mailMessages).set({ applicationId: application?.id ?? null }).where(and(eq(mailMessages.threadId, parsed.data.threadId), eq(mailMessages.workspaceId, organization.id)));
  });
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: parsed.data.applicationId
      ? "mailbox.thread.application_linked"
      : "mailbox.thread.application_unlinked",
    resourceType: "mail_thread",
    resourceId: parsed.data.threadId,
    metadata: { applicationId: parsed.data.applicationId },
  });
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}

export async function linkMailboxThreadToCandidateAction(input: { threadId: string; candidateId: string | null }) {
  const parsed = z.object({ threadId: z.string().uuid(), candidateId: z.string().uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid thread or candidate." };
  await requirePermission("candidates:edit");
  const { organization, user } = await getWorkspaceContext();
  if (parsed.data.candidateId) {
    const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.id, parsed.data.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt))).limit(1);
    if (!candidate) return { ok: false, error: "Candidate does not belong to this workspace." };
  }
  await db.transaction(async (tx) => {
    await tx.update(mailThreads).set({ candidateId: parsed.data.candidateId, applicationId: null }).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id)));
    await tx.update(mailMessages).set({ candidateId: parsed.data.candidateId, applicationId: null }).where(and(eq(mailMessages.threadId, parsed.data.threadId), eq(mailMessages.workspaceId, organization.id)));
  });
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: parsed.data.candidateId
      ? "mailbox.thread.candidate_linked"
      : "mailbox.thread.candidate_unlinked",
    resourceType: "mail_thread",
    resourceId: parsed.data.threadId,
    metadata: { candidateId: parsed.data.candidateId },
  });
  revalidatePath("/dashboard/inbox");
  return { ok: true };
}
export async function markMailboxThreadReadAction(input: { threadId: string }) {
  const parsed = threadId.safeParse(input.threadId); if (!parsed.success) return { ok: false };
  await requirePermission("collab:write");
  const { organization } = await getWorkspaceContext();
  await db.update(mailMessages).set({ readAt: new Date() }).where(and(eq(mailMessages.threadId, parsed.data), eq(mailMessages.workspaceId, organization.id)));
  await db.update(mailThreads).set({ unreadCount: 0 }).where(and(eq(mailThreads.id, parsed.data), eq(mailThreads.workspaceId, organization.id)));
  revalidatePath("/dashboard/inbox"); return { ok: true };
}

/** Marks a message read from the single Inbox surface, including legacy webhooks. */
export async function markInboxThreadReadAction(input: {
  threadId: string;
  source: "mailbox";
}) {
  const parsed = inboxThread.safeParse(input);
  if (!parsed.success) return { ok: false };
  return markMailboxThreadReadAction({ threadId: parsed.data.threadId });
}

export async function replyMailboxThreadAction(input: { threadId: string; body: string }) {
  const parsed = z.object({ threadId: z.string().uuid(), body: z.string().trim().min(1).max(100_000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reply." };
  await requirePermission("collab:write");
  const { organization, user } = await getWorkspaceContext();
  const config = await getMailboxConfig(organization.id);
  if (!config) return { ok: false, error: "The recruiting mailbox is not enabled." };
  const [thread] = await db.select().from(mailThreads).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread?.participantEmail) return { ok: false, error: "This thread has no reply address." };
  const [lastMessage] = await db.select().from(mailMessages).where(and(eq(mailMessages.threadId, thread.id), eq(mailMessages.workspaceId, organization.id))).orderBy(desc(mailMessages.receivedAt)).limit(1);
  try {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.tls, auth: { user: config.smtp.user, pass: config.smtp.password } });
    const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
    const info = await transport.sendMail({ from: config.address, to: thread.participantEmail, subject, text: parsed.data.body, inReplyTo: lastMessage?.messageId ?? undefined, references: lastMessage?.messageId ?? undefined });
    const now = new Date();
    await db.insert(mailMessages).values({ workspaceId: organization.id, threadId: thread.id, candidateId: thread.candidateId, applicationId: thread.applicationId, messageId: info.messageId || null, inReplyTo: lastMessage?.messageId ?? null, references: lastMessage?.messageId ?? null, direction: "outbound", fromEmail: config.address, toEmails: [thread.participantEmail], subject, textBody: parsed.data.body, receivedAt: now, readAt: now });
    let sentCopySaved = true;
    if (config.smtp.sentFolder) {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({ host: config.imap.host, port: config.imap.port, secure: config.imap.tls, auth: { user: config.imap.user, pass: config.imap.password }, logger: false });
      const raw = Buffer.from([`From: ${config.address}`, `To: ${thread.participantEmail}`, `Subject: ${subject}`, `Message-ID: ${info.messageId}`, lastMessage?.messageId ? `In-Reply-To: ${lastMessage.messageId}` : "", "Content-Type: text/plain; charset=utf-8", "", parsed.data.body].filter(Boolean).join("\r\n"));
      try { await client.connect(); await client.append(config.smtp.sentFolder, raw); } catch { sentCopySaved = false; } finally { await client.logout().catch(() => undefined); }
    }
    await db.update(mailThreads).set({ lastMessageAt: now }).where(eq(mailThreads.id, thread.id));
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "mailbox.reply.sent",
      resourceType: "mail_thread",
      resourceId: thread.id,
      metadata: { sentCopySaved },
    });
    revalidatePath("/dashboard/inbox"); return { ok: true, sentCopySaved };
  } catch (error) {
    log.error(error, "reply send failed");
    return { ok: false, error: "Unable to send reply. Please try again." };
  }
}

export async function retryMailboxSyncAction() {
  const context = await requirePermission("integrations:manage");
  try {
    const result = await syncMailbox(context.organization.id);
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "mailbox.sync.completed",
      resourceType: "mailbox",
      metadata: {
        imported: result.imported,
        skipped: result.skipped,
      },
    });
    revalidatePath("/dashboard/inbox");
    return { ok: true, ...result };
  } catch (error) {
    log.error(error, "manual mailbox sync failed");
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "mailbox.sync.failed",
      resourceType: "mailbox",
      severity: "warning",
    });
    revalidatePath("/dashboard/inbox");
    return { ok: false, error: "Mailbox synchronization failed. Check the mailbox settings and try again." };
  }
}

async function getMailboxMessagesForAi(threadId: string) {
  const { organization } = await getWorkspaceContext();
  const [thread] = await db.select({ id: mailThreads.id, subject: mailThreads.subject, participantEmail: mailThreads.participantEmail }).from(mailThreads).where(and(eq(mailThreads.id, threadId), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread) return null;
  const rows = await db.select({ direction: mailMessages.direction, fromEmail: mailMessages.fromEmail, toEmails: mailMessages.toEmails, body: mailMessages.textBody, receivedAt: mailMessages.receivedAt }).from(mailMessages).where(and(eq(mailMessages.threadId, thread.id), eq(mailMessages.workspaceId, organization.id))).orderBy(desc(mailMessages.receivedAt)).limit(20);
  return { thread, messages: rows.reverse(), workspaceId: organization.id };
}

export async function summarizeMailboxThreadAction(input: { threadId: string }) {
  const parsed = threadId.safeParse(input.threadId);
  if (!parsed.success) return { ok: false, error: "Invalid thread." };
  const context = await requirePermission("collab:write");
  try {
    await Promise.all([
      enforceRateLimit(`ai-inbox:workspace:${context.organization.id}`, { limit: 60, windowMs: 60 * 60_000 }),
      enforceRateLimit(`ai-inbox:user:${context.organization.id}:${context.user.id}`, { limit: 20, windowMs: 60 * 60_000 }),
    ]);
    const config = await getWorkspaceAiConfig(context.organization.id);
    if (!config) return { ok: false, error: "Enable AI in Settings to use Inbox assistance." };
    const data = await getMailboxMessagesForAi(parsed.data);
    if (!data) return { ok: false, error: "Thread not found." };
    const summary = await generateMailboxSummaryWithAI(config, {
      subject: data.thread.subject,
      participantEmail: data.thread.participantEmail,
      messages: data.messages.map((message) => ({ ...message, toEmails: Array.isArray(message.toEmails) ? message.toEmails.filter((item): item is string => typeof item === "string") : [] })),
    });
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "mailbox.ai.summary_generated",
      resourceType: "mail_thread",
      resourceId: parsed.data,
      metadata: { messageCount: data.messages.length },
    });
    return { ok: true, summary };
  } catch {
    return { ok: false, error: "AI could not summarize this thread. The Inbox is still available." };
  }
}

export async function suggestMailboxReplyAction(input: { threadId: string }) {
  const parsed = threadId.safeParse(input.threadId);
  if (!parsed.success) return { ok: false, error: "Invalid thread." };
  const context = await requirePermission("collab:write");
  try {
    await Promise.all([
      enforceRateLimit(`ai-inbox:workspace:${context.organization.id}`, { limit: 60, windowMs: 60 * 60_000 }),
      enforceRateLimit(`ai-inbox:user:${context.organization.id}:${context.user.id}`, { limit: 20, windowMs: 60 * 60_000 }),
    ]);
    const config = await getWorkspaceAiConfig(context.organization.id);
    if (!config) return { ok: false, error: "Enable AI in Settings to use Inbox assistance." };
    const data = await getMailboxMessagesForAi(parsed.data);
    if (!data) return { ok: false, error: "Thread not found." };
    const draft = await generateMailboxReplyWithAI(config, {
      subject: data.thread.subject,
      participantEmail: data.thread.participantEmail,
      messages: data.messages.map((message) => ({ ...message, toEmails: Array.isArray(message.toEmails) ? message.toEmails.filter((item): item is string => typeof item === "string") : [] })),
    });
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "mailbox.ai.reply_drafted",
      resourceType: "mail_thread",
      resourceId: parsed.data,
      metadata: { messageCount: data.messages.length },
    });
    return { ok: true, draft };
  } catch {
    return { ok: false, error: "AI could not draft a reply. The Inbox is still available." };
  }
}

/** Create a candidate from a reviewed inbox sender, then associate the whole thread. */
export async function createCandidateFromMailboxThreadAction(input: { threadId: string }) {
  const parsed = threadId.safeParse(input.threadId); if (!parsed.success) return { ok: false, error: "Invalid thread." };
  await requirePermission("candidates:edit");
  const { organization, user } = await getWorkspaceContext();
  const [thread] = await db.select().from(mailThreads).where(and(eq(mailThreads.id, parsed.data), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread?.participantEmail) return { ok: false, error: "This thread has no sender email." };
  const [existing] = await db.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.workspaceId, organization.id), eq(candidates.email, thread.participantEmail))).limit(1);
  const candidateId = existing?.id ?? (await db.insert(candidates).values({ workspaceId: organization.id, firstName: thread.participantEmail.split("@")[0] || "Inbox", lastName: "Candidate", email: thread.participantEmail }).returning({ id: candidates.id }))[0].id;
  await db.update(mailThreads).set({ candidateId }).where(eq(mailThreads.id, thread.id));
  await db.update(mailMessages).set({ candidateId }).where(and(eq(mailMessages.threadId, thread.id), eq(mailMessages.workspaceId, organization.id)));
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: "mailbox.thread.candidate_created",
    resourceType: "mail_thread",
    resourceId: thread.id,
    metadata: { candidateId },
  });
  revalidatePath("/dashboard/inbox"); revalidatePath("/dashboard/candidates"); return { ok: true, candidateId };
}
