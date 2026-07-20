import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  jobs,
  mailAttachments,
  mailMessages,
  mailThreads,
  mailboxes,
  member as workspaceMember,
  user,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

export type InboxSource = "mailbox";
export type InboxTransport = "imap" | "legacy-webhook" | "provider";
export type InboxFilter =
  | "all"
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
  ownerName: string | null;
  ownerId?: string | null;
  ownerImage?: string | null;
  applicationId?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  applicationStatus?: string | null;
  hasInboundReply?: boolean;
  preview: string | null;
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
  lastSyncedAt: string | null;
  lastHealthyAt: string | null;
  lastError: string | null;
};

const PAGE_SIZE = 40;

export function normalizeInboxFilter(value: string | undefined): InboxFilter {
  return [
    "all",
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
}> {
  const { organization, user: currentUser } = await getWorkspaceContext();
  const filter = normalizeInboxFilter(input.filter);
  const page = Math.max(0, Math.floor(input.page ?? 0));
  const offset = page * PAGE_SIZE;
  const threadWhere = and(
    eq(mailThreads.workspaceId, organization.id),
    filter === "archived"
      ? eq(mailThreads.status, "archived")
      : filter === "unassigned"
        ? and(eq(mailThreads.status, "open"), isNull(mailThreads.candidateId))
        : eq(mailThreads.status, "open"),
    filter === "unread" ? sql`${mailThreads.unreadCount} > 0` : undefined,
    filter === "candidates" ? isNotNull(mailThreads.candidateId) : undefined,
    filter === "assigned" || filter === "assigned-to-me" ? isNotNull(mailThreads.ownerId) : undefined,
    filter === "assigned-to-me" ? eq(mailThreads.ownerId, currentUser.id) : undefined,
    filter === "replies"
      ? sql`exists (select 1 from mail_messages reply where reply.thread_id = ${mailThreads.id} and reply.direction = 'inbound')`
      : undefined,
  );

  const [threadRows, memberRows, candidateRows, applicationRows, mailboxRows] = await Promise.all([
    db
      .select({
        id: mailThreads.id,
        transport: mailThreads.source,
        subject: mailThreads.subject,
        participantEmail: mailThreads.participantEmail,
        status: mailThreads.status,
        unreadCount: mailThreads.unreadCount,
        lastMessageAt: mailThreads.lastMessageAt,
        candidateId: mailThreads.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        ownerId: mailThreads.ownerId,
        ownerName: user.name,
        ownerImage: user.image,
        applicationId: mailThreads.applicationId,
        jobId: jobs.id,
        jobTitle: jobs.title,
        applicationStatus: applications.status,
        hasInboundReply: sql<boolean>`exists (select 1 from mail_messages reply where reply.thread_id = ${mailThreads.id} and reply.direction = 'inbound')`,
        preview: sql<string | null>`(
          select mm.text_body from mail_messages mm
          where mm.thread_id = ${mailThreads.id}
          order by mm.received_at desc limit 1
        )`,
      })
      .from(mailThreads)
      .leftJoin(candidates, and(eq(candidates.id, mailThreads.candidateId), eq(candidates.workspaceId, organization.id)))
      .leftJoin(user, eq(user.id, mailThreads.ownerId))
      .leftJoin(workspaceMember, and(eq(workspaceMember.userId, user.id), eq(workspaceMember.organizationId, organization.id)))
      .leftJoin(applications, and(eq(applications.id, mailThreads.applicationId), eq(applications.workspaceId, organization.id)))
      .leftJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, organization.id)))
      .where(threadWhere)
      .orderBy(desc(mailThreads.lastMessageAt))
      .limit(PAGE_SIZE + 1)
      .offset(offset),
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
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(applications.workspaceId, organization.id), isNull(jobs.deletedAt)))
      .orderBy(jobs.title),
    db
      .select({ configured: sql<boolean>`true`, enabled: mailboxes.enabled, lastSyncedAt: mailboxes.lastSyncedAt, lastHealthyAt: mailboxes.lastHealthyAt, lastError: mailboxes.lastError })
      .from(mailboxes)
      .where(eq(mailboxes.workspaceId, organization.id))
      .limit(1),
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
    candidateId: row.candidateId,
    candidateName: row.candidateFirstName
      ? `${row.candidateFirstName} ${row.candidateLastName}`.trim()
      : null,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownerImage: row.ownerImage,
    applicationId: row.applicationId,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    applicationStatus: row.applicationStatus,
    hasInboundReply: Boolean(row.hasInboundReply),
    preview: row.preview,
  }));

  const selectedThread = input.threadId
    ? threads.find((thread) => thread.id === input.threadId)
    : threads[0];
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
    mailboxStatus: mailboxRows[0]
      ? {
          configured: true,
          enabled: mailboxRows[0].enabled,
          lastSyncedAt: mailboxRows[0].lastSyncedAt?.toISOString() ?? null,
          lastHealthyAt: mailboxRows[0].lastHealthyAt?.toISOString() ?? null,
          lastError: mailboxRows[0].lastError,
        }
      : { configured: false, enabled: false, lastSyncedAt: null, lastHealthyAt: null, lastError: null },
  };
}
