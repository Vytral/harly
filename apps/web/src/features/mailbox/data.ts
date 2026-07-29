import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  jobs,
  jobStages,
  mailAttachments,
  mailMessages,
  mailThreads,
  mailboxes,
  member as workspaceMember,
  user,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceInboundEmailStatus } from "@/lib/email/config";
import { getWorkspaceEmailSender } from "@/lib/email";

export type InboxSource = "mailbox";
export type InboxTransport = "imap" | "legacy-webhook" | "provider" | "smtp";
export type InboxFilter =
  | "all"
  | "needs-reply"
  | "replies"
  | "unassigned"
  | "unread"
  | "candidates"
  | "assigned"
  | "assigned-to-me"
  | "archived";

export type InboxThread = {
  id: string;
  source: InboxSource;
  transport: InboxTransport;
  subject: string;
  participantEmail: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: string;
  candidateId: string | null;
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  ownerName: string | null;
  ownerId?: string | null;
  ownerImage?: string | null;
  applicationId?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  applicationStatus?: string | null;
  applicationStageName?: string | null;
  hasInboundReply?: boolean;
  needsReply?: boolean;
  preview: string | null;
  searchText?: string | null;
};

export type InboxMessage = {
  id: string;
  source: InboxSource;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  body: string;
  receivedAt: string;
  direction: "inbound" | "outbound";
  read: boolean;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
};

export type InboxMember = { id: string; name: string; image: string | null };
export type InboxCandidate = { id: string; name: string; email: string; avatarUrl: string | null };
export type InboxApplication = { id: string; candidateId: string; jobId: string; jobTitle: string; status: string };
export type InboxMailboxStatus = {
  configured: boolean;
  enabled: boolean;
  route: "mailbox" | "webhook" | "none" | "conflict";
  provider: "resend" | "postmark" | null;
  address: string | null;
  replyDomain: string | null;
  lastSyncedAt: string | null;
  lastHealthyAt: string | null;
  lastError: string | null;
  canReply: boolean;
};

const PAGE_SIZE = 40;

export function normalizeInboxFilter(value: string | undefined): InboxFilter {
  return [
    "all",
    "needs-reply",
    "replies",
    "unassigned",
    "unread",
    "candidates",
    "assigned",
    "assigned-to-me",
    "archived",
  ].includes(value as InboxFilter)
    ? (value as InboxFilter)
    : "all";
}


export async function getInboxData(input: {
  filter?: string;
  page?: number;
  threadId?: string;
} = {}): Promise<{
  threads: InboxThread[];
  messages: Record<string, InboxMessage[]>;
  hasMore: boolean;
  members: InboxMember[];
  candidates: InboxCandidate[];
  applications: InboxApplication[];
  mailboxStatus: InboxMailboxStatus;
  currentUserId: string;
}> {
  const { organization, user: currentUser } = await getWorkspaceContext();
  const filter = normalizeInboxFilter(input.filter);
  const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page as number) : 0;
  const page = Math.min(100, Math.max(0, requestedPage));
  // `page` is the number of the last loaded page in the client. Return all
  // pages up to it so "Load more" appends from the user's perspective instead
  // of replacing the current list with only the next slice.
  const limit = (page + 1) * PAGE_SIZE + 1;
  const activeCandidateLink = or(
    isNull(mailThreads.candidateId),
    isNotNull(candidates.id),
  );
  const threadWhere = and(
    eq(mailThreads.workspaceId, organization.id),
    activeCandidateLink,
    filter === "archived"
      ? eq(mailThreads.status, "archived")
      : filter === "unassigned"
        ? and(eq(mailThreads.status, "open"), isNull(candidates.id))
        : eq(mailThreads.status, "open"),
    filter === "unread" ? sql`${mailThreads.unreadCount} > 0` : undefined,
    filter === "candidates" ? isNotNull(candidates.id) : undefined,
    filter === "assigned" || filter === "assigned-to-me" ? isNotNull(mailThreads.ownerId) : undefined,
    filter === "assigned-to-me" ? eq(mailThreads.ownerId, currentUser.id) : undefined,
    filter === "replies"
      ? sql`exists (select 1 from mail_messages reply where reply.thread_id = ${mailThreads.id} and reply.direction = 'inbound')`
      : undefined,
    filter === "needs-reply"
      ? sql`(
        select mm.direction from mail_messages mm
        where mm.thread_id = ${mailThreads.id}
        order by mm.received_at desc limit 1
      ) = 'inbound'`
      : undefined,
  );

  const [threadRows, memberRows, candidateRows, applicationRows, mailboxRows, inboundStatus, sender] = await Promise.all([
    db
      .select({
        id: mailThreads.id,
        transport: mailThreads.source,
        subject: mailThreads.subject,
        participantEmail: mailThreads.participantEmail,
        status: mailThreads.status,
        unreadCount: mailThreads.unreadCount,
        lastMessageAt: mailThreads.lastMessageAt,
        activeCandidateId: candidates.id,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        candidateAvatarUrl: candidates.avatarUrl,
        ownerId: mailThreads.ownerId,
        ownerName: user.name,
        ownerImage: user.image,
        applicationId: mailThreads.applicationId,
        jobId: jobs.id,
        jobTitle: jobs.title,
        applicationStatus: applications.status,
        applicationStageName: jobStages.name,
        hasInboundReply: sql<boolean>`exists (select 1 from mail_messages reply where reply.thread_id = ${mailThreads.id} and reply.direction = 'inbound')`,
        needsReply: sql<boolean>`(
          select mm.direction from mail_messages mm
          where mm.thread_id = ${mailThreads.id}
          order by mm.received_at desc limit 1
        ) = 'inbound'`,
        preview: sql<string | null>`(
          select mm.text_body from mail_messages mm
          where mm.thread_id = ${mailThreads.id}
          order by mm.received_at desc limit 1
        )`,
        searchText: sql<string | null>`(
          select string_agg(mm.text_body, ' ' order by mm.received_at desc)
          from mail_messages mm
          where mm.thread_id = ${mailThreads.id}
        )`,
      })
      .from(mailThreads)
      .leftJoin(candidates, and(eq(candidates.id, mailThreads.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
      .leftJoin(workspaceMember, and(eq(workspaceMember.userId, mailThreads.ownerId), eq(workspaceMember.organizationId, organization.id)))
      .leftJoin(user, eq(user.id, workspaceMember.userId))
      .leftJoin(
        applications,
        and(
          eq(applications.id, mailThreads.applicationId),
          eq(applications.workspaceId, organization.id),
          eq(applications.candidateId, candidates.id),
        ),
      )
      .leftJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, organization.id), isNull(jobs.deletedAt)))
      .leftJoin(jobStages, and(eq(jobStages.id, applications.currentStageId), eq(jobStages.workspaceId, organization.id)))
      .where(
        input.threadId
          ? or(threadWhere, and(eq(mailThreads.workspaceId, organization.id), eq(mailThreads.id, input.threadId), activeCandidateLink))
          : threadWhere,
      )
      .orderBy(desc(mailThreads.lastMessageAt))
      .limit(limit),
    db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(workspaceMember)
      .innerJoin(user, eq(user.id, workspaceMember.userId))
      .where(eq(workspaceMember.organizationId, organization.id))
      .orderBy(user.name),
    db
      .select({ id: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email, avatarUrl: candidates.avatarUrl })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
      .orderBy(candidates.lastName, candidates.firstName),
    db
      .select({ id: applications.id, candidateId: applications.candidateId, jobId: applications.jobId, jobTitle: jobs.title, status: applications.status })
      .from(applications)
      .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, organization.id), isNull(jobs.deletedAt)))
      .innerJoin(candidates, and(eq(candidates.id, applications.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
      .where(eq(applications.workspaceId, organization.id))
      .orderBy(jobs.title),
    db
      .select({ configured: sql<boolean>`true`, enabled: mailboxes.enabled, address: mailboxes.address, lastSyncedAt: mailboxes.lastSyncedAt, lastHealthyAt: mailboxes.lastHealthyAt, lastError: mailboxes.lastError })
      .from(mailboxes)
      .where(eq(mailboxes.workspaceId, organization.id))
      .limit(1),
    getWorkspaceInboundEmailStatus(organization.id),
    getWorkspaceEmailSender(organization.id),
  ]);

  const hasMore = threadRows.length > PAGE_SIZE;
  const threads: InboxThread[] = threadRows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    source: "mailbox",
    transport: row.transport,
    subject: row.subject,
    participantEmail: row.participantEmail,
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt.toISOString(),
    candidateId: row.activeCandidateId,
    candidateName: row.candidateFirstName
      ? `${row.candidateFirstName} ${row.candidateLastName}`.trim()
      : null,
    candidateAvatarUrl: row.candidateAvatarUrl,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownerImage: row.ownerImage,
    // A thread may retain a historical application link after its job enters
    // the trash. Keep the conversation visible, but do not expose the stale
    // requisition/application association in Inbox.
    applicationId: row.activeCandidateId && row.jobId ? row.applicationId : null,
    jobId: row.activeCandidateId && row.jobId ? row.jobId : null,
    jobTitle: row.activeCandidateId && row.jobId ? row.jobTitle : null,
    applicationStatus: row.activeCandidateId && row.jobId ? row.applicationStatus : null,
    applicationStageName: row.activeCandidateId && row.jobId ? row.applicationStageName : null,
    hasInboundReply: Boolean(row.hasInboundReply),
    needsReply: Boolean(row.needsReply),
    preview: row.preview,
    searchText: row.searchText,
  }));

  const selectedThread = input.threadId ? threads.find((thread) => thread.id === input.threadId) : undefined;
  const selectedMessages = selectedThread
    ? await db
        .select()
        .from(mailMessages)
        .where(and(eq(mailMessages.workspaceId, organization.id), eq(mailMessages.threadId, selectedThread.id)))
        .orderBy(desc(mailMessages.receivedAt))
    : [];
  const attachmentRows = selectedMessages.length
    ? await db
        .select({
          id: mailAttachments.id,
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          contentType: mailAttachments.contentType,
          size: mailAttachments.size,
        })
        .from(mailAttachments)
        .where(and(
          eq(mailAttachments.workspaceId, organization.id),
          inArray(mailAttachments.messageId, selectedMessages.map((message) => message.id)),
        ))
    : [];
  const attachmentsByMessage = new Map<string, typeof attachmentRows>();
  for (const attachment of attachmentRows) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }

  const messages: Record<string, InboxMessage[]> = {};
  if (selectedThread) {
    messages[selectedThread.id] = selectedMessages.map((message) => ({
      id: message.id,
      source: "mailbox",
      fromEmail: message.fromEmail,
      toEmails: Array.isArray(message.toEmails)
        ? message.toEmails.filter((item): item is string => typeof item === "string")
        : [],
      subject: message.subject,
      body: message.textBody,
      receivedAt: message.receivedAt.toISOString(),
      direction: message.direction,
      read: message.readAt !== null,
      attachments: attachmentsByMessage.get(message.id) ?? [],
    }));
  }

  const mailbox = mailboxRows[0];
  const mailboxEnabled = Boolean(mailbox?.enabled);
  const hasOutboundSender = sender !== null;
  const canReply = mailboxEnabled || hasOutboundSender;
  const webhookConfigured = Boolean(
    inboundStatus.provider &&
      inboundStatus.replyDomain &&
      inboundStatus.hasWebhookSecret &&
      inboundStatus.encryptionReady &&
      (inboundStatus.provider !== "resend" || inboundStatus.hasResendApiKey),
  );
  const webhookEnabled = inboundStatus.enabled && webhookConfigured;
  const route = mailboxEnabled && webhookEnabled
    ? "conflict"
    : mailboxEnabled
      ? "mailbox"
      : webhookEnabled
        ? "webhook"
        : mailbox
          ? "mailbox"
          : inboundStatus.provider || inboundStatus.hasWebhookSecret
            ? "webhook"
            : "none";

  return {
    threads,
    messages,
    hasMore,
    members: memberRows,
    candidates: candidateRows.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      email: row.email,
      avatarUrl: row.avatarUrl,
    })),
    applications: applicationRows,
    mailboxStatus: mailbox
      ? {
          configured: true,
          enabled: route === "mailbox"
            ? mailboxEnabled
            : route === "webhook"
              ? webhookEnabled
              : false,
          route,
          provider: inboundStatus.provider,
          address: mailbox.address,
          replyDomain: inboundStatus.replyDomain,
          lastSyncedAt: mailbox.lastSyncedAt?.toISOString() ?? null,
          lastHealthyAt: mailbox.lastHealthyAt?.toISOString() ?? null,
          lastError: mailbox.lastError,
          canReply,
        }
      : {
          configured: webhookConfigured,
          enabled: webhookEnabled,
          route,
          provider: inboundStatus.provider,
          address: null,
          replyDomain: inboundStatus.replyDomain,
          lastSyncedAt: null,
          lastHealthyAt: null,
          lastError: null,
          canReply,
        },
    currentUserId: currentUser.id,
  };
}

export async function getUnreadInboxThreadCount(): Promise<number> {
  const { organization } = await getWorkspaceContext();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mailThreads)
    .leftJoin(candidates, and(eq(candidates.id, mailThreads.candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)))
    .where(
      and(
        eq(mailThreads.workspaceId, organization.id),
        or(isNull(mailThreads.candidateId), isNotNull(candidates.id)),
        eq(mailThreads.status, "open"),
        sql`${mailThreads.unreadCount} > 0`,
      ),
    );
  return row?.count ?? 0;
}
