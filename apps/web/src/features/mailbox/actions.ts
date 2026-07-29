"use server";

import { revalidatePath } from "next/cache";
import { composerAttachmentsSchema, decodeComposerAttachments, richBodyReact } from "@/features/mailbox/compose-shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { applications, candidates, db, jobs, mailMessages, mailThreads, member } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getMailboxConfig } from "@/lib/mailbox/config";
import { createLogger } from "@/lib/logger";
import { syncMailbox } from "@/lib/mailbox/sync";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { enforceRateLimit } from "@/server/api/ratelimit";
import { generateMailboxReplyWithAI, generateMailboxSummaryWithAI } from "@/lib/ai/surfaces/mailbox-assistance";
import { logAuditEvent } from "@/lib/audit-log";
import { getWorkspaceEmailSender } from "@/lib/email";
import { getInboundReplyTo } from "@/lib/email/inbound-token";
import { insertCanonicalMessage } from "@/lib/mail/canonical";
import { sendCanonicalEmail } from "@/lib/mail/send-canonical-email";
import { isMailUnificationEnabled } from "@/lib/mail/feature-flag";
import { completeLegacyMailDelivery, failLegacyMailDelivery, reserveLegacyMailDelivery } from "@/lib/mail/legacy-delivery";

const log = createLogger("mailbox");

const threadId = z.string().uuid();
const inboxThread = z.object({
  threadId: z.string().uuid(),
  source: z.literal("mailbox"),
});
const updateMailboxThreadSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["open", "archived", "spam"]).optional(),
  ownerId: z.string().trim().min(1).max(255).nullable().optional(),
});

async function getActiveMailboxApplicationId(input: {
  workspaceId: string;
  candidateId: string | null;
  applicationId: string | null;
}): Promise<string | null> {
  if (!input.candidateId || !input.applicationId) return null;

  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.id, input.applicationId),
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.candidateId, input.candidateId),
      ),
    )
    .limit(1);

  return application?.id ?? null;
}

export async function updateMailboxThreadAction(input: { threadId: string; status?: "open" | "archived" | "spam"; ownerId?: string | null }) {
  const parsed = updateMailboxThreadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid thread update." };
  await requirePermission("collab:write");
  const { organization, user } = await getWorkspaceContext();
  if (parsed.data.ownerId) {
    const [assignee] = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, organization.id), eq(member.userId, parsed.data.ownerId))).limit(1);
    if (!assignee) return { ok: false, error: "Assignee is not a workspace member." };
  }
  const [updated] = await db.update(mailThreads).set({ ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.ownerId !== undefined ? { ownerId: parsed.data.ownerId } : {}) }).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id))).returning({ id: mailThreads.id });
  if (!updated) return { ok: false, error: "Thread not found." };
  await logAuditEvent({
    workspaceId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    action: parsed.data.status === "archived"
      ? "mailbox.thread.archived"
      : parsed.data.status === "spam"
        ? "mailbox.thread.marked_spam"
        : parsed.data.ownerId
          ? "mailbox.thread.assigned"
          : parsed.data.ownerId === null
            ? "mailbox.thread.unassigned"
            : "mailbox.thread.updated",
    resourceType: "mail_thread",
    resourceId: parsed.data.threadId,
    metadata: {
      status: parsed.data.status ?? null,
      ownerId: parsed.data.ownerId ?? null,
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
  const [activeCandidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, thread.candidateId),
        eq(candidates.workspaceId, organization.id),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!activeCandidate) return { ok: false, error: "The candidate is no longer active." };
  const application = parsed.data.applicationId
    ? (await db
        .select({ id: applications.id })
        .from(applications)
        .innerJoin(
          jobs,
          and(
            eq(jobs.id, applications.jobId),
            eq(jobs.workspaceId, organization.id),
            isNull(jobs.deletedAt),
          ),
        )
        .where(
          and(
            eq(applications.id, parsed.data.applicationId),
            eq(applications.workspaceId, organization.id),
            eq(applications.candidateId, thread.candidateId),
          ),
        )
        .limit(1))[0]
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
  const [updated] = await db.update(mailThreads)
    .set({ unreadCount: 0 })
    .where(and(eq(mailThreads.id, parsed.data), eq(mailThreads.workspaceId, organization.id)))
    .returning({ id: mailThreads.id });
  if (!updated) return { ok: false, error: "Thread not found." };
  await db.update(mailMessages).set({ readAt: new Date() }).where(and(eq(mailMessages.threadId, parsed.data), eq(mailMessages.workspaceId, organization.id)));
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

export async function replyMailboxThreadAction(input: {
  threadId: string;
  body: string;
  html?: string;
  subject?: string;
  attachments?: Array<{ filename: string; contentType: string; base64: string }>;
  idempotencyKey: string;
}) {
  const parsed = z
    .object({
      threadId: z.string().uuid(),
      body: z.string().trim().min(1).max(100_000),
      html: z.string().max(500_000).optional(),
      subject: z.string().trim().min(1).max(300).optional(),
      attachments: composerAttachmentsSchema,
      idempotencyKey: z.string().trim().min(1).max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a reply." };
  await requirePermission("collab:write");
  const { organization, user } = await getWorkspaceContext();

  const [thread] = await db.select().from(mailThreads).where(and(eq(mailThreads.id, parsed.data.threadId), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread) return { ok: false, error: "Thread not found." };
  if (!thread.participantEmail) return { ok: false, error: "This thread has no reply address." };
  if (thread.candidateId) {
    const [activeCandidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, thread.candidateId),
          eq(candidates.workspaceId, organization.id),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!activeCandidate) return { ok: false, error: "The candidate is no longer active." };
  }

  const applicationId = await getActiveMailboxApplicationId({
    workspaceId: organization.id,
    candidateId: thread.candidateId,
    applicationId: thread.applicationId,
  });
  if (thread.applicationId && !applicationId) {
    await db.transaction(async (tx) => {
      await tx
        .update(mailThreads)
        .set({ applicationId: null })
        .where(
          and(
            eq(mailThreads.id, thread.id),
            eq(mailThreads.workspaceId, organization.id),
          ),
        );
      await tx
        .update(mailMessages)
        .set({ applicationId: null })
        .where(
          and(
            eq(mailMessages.threadId, thread.id),
            eq(mailMessages.workspaceId, organization.id),
          ),
        );
    });
  }

  const [lastMessage] = await db.select().from(mailMessages).where(and(eq(mailMessages.threadId, thread.id), eq(mailMessages.workspaceId, organization.id))).orderBy(desc(mailMessages.receivedAt)).limit(1);
  const baseSubject = parsed.data.subject ?? thread.subject;
  const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;
  const now = new Date();
  const attachments = decodeComposerAttachments(parsed.data.attachments);

  if (await isMailUnificationEnabled(organization.id)) {
    const canonical = await sendCanonicalEmail({
      workspaceId: organization.id,
      idempotencyKey: parsed.data.idempotencyKey,
      threadId: thread.id,
      candidateId: thread.candidateId,
      applicationId,
      toEmail: thread.participantEmail,
      subject,
      textBody: parsed.data.body,
      htmlBody: parsed.data.html ?? null,
      inReplyTo: lastMessage?.messageId ?? null,
      references: lastMessage?.references ? `${lastMessage.references} ${lastMessage.messageId ?? ""}`.trim() : lastMessage?.messageId ?? null,
      attachments: (attachments ?? []).map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType ?? "application/octet-stream", content: attachment.content! })),
      sourceHint: "smtp",
      authorId: user.id,
    });
    revalidatePath("/dashboard/inbox");
    return { ok: true, threadId: canonical.threadId, idempotentReplay: canonical.idempotentReplay, legacyWriteWarning: canonical.legacyWriteWarning };
  }

  const mailboxConfig = await getMailboxConfig(organization.id);

  if (mailboxConfig) {
    const delivery = await reserveLegacyMailDelivery({
      workspaceId: organization.id,
      idempotencyKey: parsed.data.idempotencyKey,
      payload: { threadId: thread.id, body: parsed.data.body, html: parsed.data.html ?? null, subject, attachments: parsed.data.attachments },
      candidateId: thread.candidateId,
      applicationId,
      threadId: thread.id,
    });
    if (delivery.kind === "replay") return { ok: true, threadId: delivery.threadId ?? thread.id, idempotentReplay: true };
    try {
      const { default: nodemailer } = await import("nodemailer");
      const transport = nodemailer.createTransport({ host: mailboxConfig.smtp.host, port: mailboxConfig.smtp.port, secure: mailboxConfig.smtp.tls, auth: { user: mailboxConfig.smtp.user, pass: mailboxConfig.smtp.password } });
      const info = await transport.sendMail({
        from: mailboxConfig.address,
        to: thread.participantEmail,
        subject,
        text: parsed.data.body,
        html: parsed.data.html?.trim() || undefined,
        attachments: attachments?.map((file) => ({ filename: file.filename, content: file.content, contentType: file.contentType })),
        inReplyTo: lastMessage?.messageId ?? undefined,
        references: lastMessage?.messageId ?? undefined,
        messageId: delivery.messageId,
      });
      const [saved] = await db.insert(mailMessages).values({ workspaceId: organization.id, threadId: thread.id, candidateId: thread.candidateId, applicationId, messageId: info.messageId || delivery.messageId, inReplyTo: lastMessage?.messageId ?? null, references: lastMessage?.messageId ?? null, direction: "outbound", fromEmail: mailboxConfig.address, toEmails: [thread.participantEmail], subject, textBody: parsed.data.body, receivedAt: now, readAt: now }).returning({ id: mailMessages.id });
      await completeLegacyMailDelivery({ id: delivery.id, threadId: thread.id, mailMessageId: saved.id, providerMessageId: info.messageId });
      let sentCopySaved = true;
      if (mailboxConfig.smtp.sentFolder) {
        const { ImapFlow } = await import("imapflow");
        const client = new ImapFlow({ host: mailboxConfig.imap.host, port: mailboxConfig.imap.port, secure: mailboxConfig.imap.tls, auth: { user: mailboxConfig.imap.user, pass: mailboxConfig.imap.password }, logger: false });
        const raw = Buffer.from([`From: ${mailboxConfig.address}`, `To: ${thread.participantEmail}`, `Subject: ${subject}`, `Message-ID: ${info.messageId || delivery.messageId}`, lastMessage?.messageId ? `In-Reply-To: ${lastMessage.messageId}` : "", "Content-Type: text/plain; charset=utf-8", "", parsed.data.body].filter(Boolean).join("\r\n"));
        try { await client.connect(); await client.append(mailboxConfig.smtp.sentFolder, raw); } catch { sentCopySaved = false; } finally { await client.logout().catch(() => undefined); }
      }
      await db.update(mailThreads).set({ lastMessageAt: now }).where(and(eq(mailThreads.id, thread.id), eq(mailThreads.workspaceId, organization.id)));
      await logAuditEvent({
        workspaceId: organization.id,
        actorId: user.id,
        actorEmail: user.email,
        action: "mailbox.reply.sent",
        resourceType: "mail_thread",
        resourceId: thread.id,
        metadata: { sentCopySaved, transport: "imap" },
      });
      revalidatePath("/dashboard/inbox"); return { ok: true, sentCopySaved };
    } catch (error) {
      await failLegacyMailDelivery(delivery.id, error);
      log.error(error, "reply send failed via IMAP");
      return { ok: false, error: "Unable to send reply. Please try again." };
    }
  }

  const sender = await getWorkspaceEmailSender(organization.id, user.id);
  if (!sender) return { ok: false, error: "Email sending is not configured. Go to Settings → Email to set up your sender." };

  const delivery = await reserveLegacyMailDelivery({
    workspaceId: organization.id,
    idempotencyKey: parsed.data.idempotencyKey,
    payload: { threadId: thread.id, body: parsed.data.body, html: parsed.data.html ?? null, subject, attachments: parsed.data.attachments },
    candidateId: thread.candidateId,
    applicationId,
    threadId: thread.id,
  });
  if (delivery.kind === "replay") return { ok: true, threadId: delivery.threadId ?? thread.id, idempotentReplay: true };

  const replyTo = applicationId
    ? await getInboundReplyTo(organization.id, applicationId)
    : undefined;

  try {
    const result = await sender.send({
      to: thread.participantEmail,
      subject,
      messageId: delivery.messageId,
      idempotencyKey: parsed.data.idempotencyKey,
      replyTo,
      react: richBodyReact(parsed.data.body, parsed.data.html),
      attachments,
    });

    const [saved] = await db.insert(mailMessages).values({
      workspaceId: organization.id,
      threadId: thread.id,
      candidateId: thread.candidateId,
      applicationId,
      messageId: result.messageId || delivery.messageId,
      inReplyTo: lastMessage?.messageId ?? null,
      references: lastMessage?.messageId ?? null,
      direction: "outbound",
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [thread.participantEmail],
      subject,
      textBody: parsed.data.body,
      receivedAt: now,
      readAt: now,
    }).returning({ id: mailMessages.id });
    await completeLegacyMailDelivery({ id: delivery.id, threadId: thread.id, mailMessageId: saved.id, providerMessageId: result.messageId });

    await db.update(mailThreads).set({ lastMessageAt: now }).where(and(eq(mailThreads.id, thread.id), eq(mailThreads.workspaceId, organization.id)));

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "mailbox.reply.sent",
      resourceType: "mail_thread",
      resourceId: thread.id,
      metadata: { transport: "provider" },
    });

    revalidatePath("/dashboard/inbox");
    return { ok: true };
  } catch (error) {
    await failLegacyMailDelivery(delivery.id, error);
    log.error(error, "reply send failed via provider");
    return { ok: false, error: "Unable to send reply. Please try again." };
  }
}

export async function createMailboxThreadAction(input: {
  candidateId?: string | null;
  toEmail: string;
  subject: string;
  body: string;
  html?: string;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; contentType: string; base64: string }>;
}) {
  const parsed = z.object({
    candidateId: z.string().uuid().nullable().optional(),
    toEmail: z.string().email(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(100_000),
    html: z.string().max(500_000).optional(),
    idempotencyKey: z.string().trim().min(1).max(200),
    attachments: composerAttachmentsSchema,
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a subject and message." };

  await requirePermission("collab:write");
  const { organization, user } = await getWorkspaceContext();
  const [candidate] = parsed.data.candidateId
    ? await db
        .select({ id: candidates.id, email: candidates.email })
        .from(candidates)
        .where(and(eq(candidates.id, parsed.data.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
        .limit(1)
    : [];
  if (parsed.data.candidateId && (!candidate || candidate.email !== parsed.data.toEmail)) return { ok: false, error: "Candidate not found." };

  const [application] = candidate
    ? await db
        .select({ id: applications.id })
        .from(applications)
        .innerJoin(
          jobs,
          and(
            eq(jobs.id, applications.jobId),
            eq(jobs.workspaceId, organization.id),
            isNull(jobs.deletedAt),
          ),
        )
        .where(and(eq(applications.workspaceId, organization.id), eq(applications.candidateId, candidate.id)))
        .orderBy(desc(applications.appliedAt))
        .limit(1)
    : [];
  const attachments = decodeComposerAttachments(parsed.data.attachments);

  if (await isMailUnificationEnabled(organization.id)) {
    const canonical = await sendCanonicalEmail({
      workspaceId: organization.id,
      idempotencyKey: parsed.data.idempotencyKey,
      candidateId: candidate?.id ?? null,
      applicationId: application?.id ?? null,
      toEmail: parsed.data.toEmail,
      subject: parsed.data.subject,
      textBody: parsed.data.body,
      htmlBody: parsed.data.html ?? null,
      attachments: (attachments ?? []).map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType ?? "application/octet-stream", content: attachment.content! })),
      authorId: user.id,
    });
    revalidatePath("/dashboard/inbox");
    return { ok: true, threadId: canonical.threadId, delivered: canonical.delivered, legacyWriteWarning: canonical.legacyWriteWarning };
  }

  const sender = await getWorkspaceEmailSender(organization.id, user.id);
  if (!sender) {
    return { ok: false, error: "Email sending is not configured. Go to Settings → Email to set up your sender." };
  }

  const delivery = await reserveLegacyMailDelivery({
    workspaceId: organization.id,
    idempotencyKey: parsed.data.idempotencyKey,
    payload: { toEmail: parsed.data.toEmail, subject: parsed.data.subject, body: parsed.data.body, html: parsed.data.html ?? null, attachments: parsed.data.attachments },
    candidateId: candidate?.id ?? null,
    applicationId: application?.id ?? null,
  });
  if (delivery.kind === "replay") return { ok: true, threadId: delivery.threadId ?? "", delivered: true, idempotentReplay: true };

  try {
    const result = await sender.send({
      to: parsed.data.toEmail,
      subject: parsed.data.subject,
      messageId: delivery.messageId,
      idempotencyKey: parsed.data.idempotencyKey,
      replyTo: application ? await getInboundReplyTo(organization.id, application.id) : undefined,
      react: richBodyReact(parsed.data.body, parsed.data.html),
      attachments,
    });
    const created = await insertCanonicalMessage({
      workspaceId: organization.id,
      source: "provider",
      candidateId: candidate?.id ?? null,
      applicationId: application?.id ?? null,
      participantEmail: parsed.data.toEmail,
      subject: parsed.data.subject,
      receivedAt: new Date(),
      messageId: result.messageId || delivery.messageId,
      direction: "outbound",
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [parsed.data.toEmail],
      textBody: parsed.data.body,
      htmlBody: parsed.data.html,
      readAt: new Date(),
    });
    await completeLegacyMailDelivery({ id: delivery.id, threadId: created.threadId, mailMessageId: created.messageId, providerMessageId: result.messageId });
    revalidatePath("/dashboard/inbox");
    return { ok: true, threadId: created.threadId, delivered: true };
  } catch (error) {
    await failLegacyMailDelivery(delivery.id, error);
    return { ok: false, error: "Unable to send the email. Please try again." };
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
  const [thread] = await db.select({ id: mailThreads.id, subject: mailThreads.subject, participantEmail: mailThreads.participantEmail, candidateId: mailThreads.candidateId }).from(mailThreads).where(and(eq(mailThreads.id, threadId), eq(mailThreads.workspaceId, organization.id))).limit(1);
  if (!thread) return null;
  if (thread.candidateId) {
    const [activeCandidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, thread.candidateId),
          eq(candidates.workspaceId, organization.id),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!activeCandidate) return null;
  }
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
  const [existing] = await db.select({ id: candidates.id, deletedAt: candidates.deletedAt }).from(candidates).where(and(eq(candidates.workspaceId, organization.id), eq(candidates.email, thread.participantEmail))).limit(1);
  if (existing?.deletedAt) return { ok: false, error: "This sender belongs to a candidate in the trash. Restore or purge that candidate first." };
  const candidateId = existing?.id ?? (await db.insert(candidates).values({ workspaceId: organization.id, firstName: thread.participantEmail.split("@")[0] || "Inbox", lastName: "Candidate", email: thread.participantEmail }).returning({ id: candidates.id }))[0].id;
  await db.update(mailThreads).set({ candidateId }).where(and(eq(mailThreads.id, thread.id), eq(mailThreads.workspaceId, organization.id)));
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
