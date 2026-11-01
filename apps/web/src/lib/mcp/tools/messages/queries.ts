import "server-only";

import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  mailAttachments,
  mailMessages,
  mailThreads,
  member as workspaceMember,
  user,
} from "@harly/db";

import { inboxFilterConditions, mailThreadScopeSql, type InboxFilter } from "@/features/mailbox/data";
import { resolveSearchActor } from "@/features/search/workspace-search";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  requireApplicationPermission,
  requireCandidatePermission,
} from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";
import { McpToolError } from "../../types";
import type { AttachmentRow, MessageRow, ThreadRow } from "./format";

/**
 * Database reads for the messages MCP tools. Every query applies the same
 * mailbox isolation as the Inbox page: the workspace predicate, the active
 * candidate link and `mailThreadScopeSql` (role scope). The write actions the
 * tools call only check the workspace, so `requireVisibleThread` runs first.
 */

const threadColumns = {
  id: mailThreads.id,
  transport: mailThreads.source,
  subject: mailThreads.subject,
  participantEmail: mailThreads.participantEmail,
  status: mailThreads.status,
  unreadCount: mailThreads.unreadCount,
  lastMessageAt: mailThreads.lastMessageAt,
  candidateId: candidates.id,
  candidateFirstName: candidates.firstName,
  candidateLastName: candidates.lastName,
  ownerId: mailThreads.ownerId,
  ownerName: user.name,
  applicationId: mailThreads.applicationId,
  jobId: jobs.id,
  jobTitle: jobs.title,
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
};

function threadSelect(workspaceId: string) {
  return db
    .select(threadColumns)
    .from(mailThreads)
    .leftJoin(
      candidates,
      and(
        eq(candidates.id, mailThreads.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .leftJoin(
      workspaceMember,
      and(eq(workspaceMember.userId, mailThreads.ownerId), eq(workspaceMember.organizationId, workspaceId)),
    )
    .leftJoin(user, eq(user.id, workspaceMember.userId))
    .leftJoin(
      applications,
      and(
        eq(applications.id, mailThreads.applicationId),
        eq(applications.workspaceId, workspaceId),
        eq(applications.candidateId, candidates.id),
      ),
    )
    .leftJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, workspaceId), isNull(jobs.deletedAt)))
    .leftJoin(jobStages, and(eq(jobStages.id, applications.currentStageId), eq(jobStages.workspaceId, workspaceId)));
}

function visibleThreadPredicate(workspaceId: string, scope: SQL | undefined) {
  return and(
    eq(mailThreads.workspaceId, workspaceId),
    // A thread whose candidate is in the trash stays hidden, as in the Inbox.
    or(isNull(mailThreads.candidateId), isNotNull(candidates.id)),
    scope,
  );
}

export async function listThreads(input: {
  filter: InboxFilter;
  candidateId?: string;
  applicationId?: string;
  query?: string;
  limit: number;
  offset: number;
}): Promise<ThreadRow[]> {
  const { organization, user: currentUser } = await getWorkspaceContext();
  const actor = await resolveSearchActor();
  const search = input.query?.trim();
  const pattern = search ? `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  return threadSelect(organization.id)
    .where(
      and(
        visibleThreadPredicate(organization.id, mailThreadScopeSql(actor)),
        ...inboxFilterConditions(input.filter, currentUser.id),
        input.candidateId ? eq(mailThreads.candidateId, input.candidateId) : undefined,
        input.applicationId ? eq(mailThreads.applicationId, input.applicationId) : undefined,
        pattern
          ? or(
              ilike(mailThreads.subject, pattern),
              ilike(mailThreads.participantEmail, pattern),
              sql`(${candidates.firstName} || ' ' || ${candidates.lastName}) ilike ${pattern}`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(mailThreads.lastMessageAt), desc(mailThreads.id))
    .limit(input.limit + 1)
    .offset(input.offset);
}

/** One thread the caller may see, in any status. Null when hidden or missing. */
export async function getVisibleThread(threadId: string): Promise<ThreadRow | null> {
  const { organization } = await getWorkspaceContext();
  const actor = await resolveSearchActor();
  const [row] = await threadSelect(organization.id)
    .where(and(eq(mailThreads.id, threadId), visibleThreadPredicate(organization.id, mailThreadScopeSql(actor))))
    .limit(1);
  return row ?? null;
}

/** Guard for every tool that mutates or reads through a thread id. */
export async function requireVisibleThread(threadId: string): Promise<ThreadRow> {
  const thread = await getVisibleThread(threadId);
  if (!thread) throw new McpToolError("Thread not found.", "not_found");
  return thread;
}

export async function listThreadMessages(
  threadId: string,
  limit: number,
): Promise<{ messages: MessageRow[]; attachments: AttachmentRow[]; hasEarlier: boolean }> {
  const { organization } = await getWorkspaceContext();
  const rows = await db
    .select({
      id: mailMessages.id,
      direction: mailMessages.direction,
      fromEmail: mailMessages.fromEmail,
      toEmails: mailMessages.toEmails,
      subject: mailMessages.subject,
      textBody: mailMessages.textBody,
      receivedAt: mailMessages.receivedAt,
      readAt: mailMessages.readAt,
    })
    .from(mailMessages)
    .where(and(eq(mailMessages.workspaceId, organization.id), eq(mailMessages.threadId, threadId)))
    .orderBy(desc(mailMessages.receivedAt))
    .limit(limit + 1);
  const hasEarlier = rows.length > limit;
  // Newest `limit` messages, returned oldest first so the thread reads in order.
  const messages = rows.slice(0, limit).reverse();
  const attachments = messages.length
    ? await db
        .select({
          id: mailAttachments.id,
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          contentType: mailAttachments.contentType,
          size: mailAttachments.size,
        })
        .from(mailAttachments)
        .where(
          and(
            eq(mailAttachments.workspaceId, organization.id),
            inArray(
              mailAttachments.messageId,
              messages.map((message) => message.id),
            ),
          ),
        )
    : [];
  return { messages, attachments, hasEarlier };
}

/** The thread an attachment belongs to, so the caller can check visibility. */
export async function getAttachmentThreadId(attachmentId: string): Promise<string | null> {
  const { organization } = await getWorkspaceContext();
  const [row] = await db
    .select({ threadId: mailMessages.threadId })
    .from(mailAttachments)
    .innerJoin(mailMessages, eq(mailMessages.id, mailAttachments.messageId))
    .where(and(eq(mailAttachments.id, attachmentId), eq(mailAttachments.workspaceId, organization.id)))
    .limit(1);
  return row?.threadId ?? null;
}

/** Candidate row for sending: refuses trashed or out-of-scope candidates. */
export async function requireSendableCandidate(candidateId: string, permission: Permission) {
  try {
    await requireCandidatePermission(permission, candidateId);
  } catch {
    throw new McpToolError("Candidate not found or not accessible to you.", "not_found");
  }
  const { organization } = await getWorkspaceContext();
  const [candidate] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(candidates)
    .where(
      and(eq(candidates.id, candidateId), eq(candidates.workspaceId, organization.id), isNull(candidates.deletedAt)),
    )
    .limit(1);
  if (!candidate) throw new McpToolError("Candidate not found.", "not_found");
  return candidate;
}

/** Job title and stage for template variables, from a chosen or the latest application. */
export async function loadApplicationContext(candidateId: string, applicationId?: string) {
  const { organization } = await getWorkspaceContext();
  if (applicationId) {
    try {
      await requireApplicationPermission("collab:write", applicationId);
    } catch {
      throw new McpToolError("Application not found or not accessible to you.", "not_found");
    }
  }
  const [row] = await db
    .select({ id: applications.id, jobTitle: jobs.title, stageName: jobStages.name })
    .from(applications)
    .innerJoin(
      jobs,
      and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, organization.id), isNull(jobs.deletedAt)),
    )
    .leftJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .where(
      and(
        eq(applications.workspaceId, organization.id),
        eq(applications.candidateId, candidateId),
        applicationId ? eq(applications.id, applicationId) : undefined,
      ),
    )
    .orderBy(desc(applications.appliedAt))
    .limit(1);
  if (applicationId && !row) throw new McpToolError("Application does not belong to this candidate.", "invalid_input");
  return row ?? null;
}

export async function listWorkspaceMembers() {
  const { organization } = await getWorkspaceContext();
  return db
    .select({ id: user.id, name: user.name })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(eq(workspaceMember.organizationId, organization.id))
    .orderBy(user.name);
}
