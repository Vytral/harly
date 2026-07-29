import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobs,
  mailAttachments,
  mailMessages,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

export type InboundAttachment = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};

export type InboundReplyItem = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string | null;
  subject: string;
  body: string;
  fromEmail: string | null;
  attachments: InboundAttachment[];
  read: boolean;
  createdAt: string;
};

/** Replies received from candidates in the active workspace, newest first. */
export async function listInboundReplies(
  limit = 100,
): Promise<InboundReplyItem[]> {
  const { organization: workspace } = await getWorkspaceContext();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(500, Math.max(1, Math.floor(limit)))
    : 100;

  const rows = await db
    .select({
      id: mailMessages.id,
      candidateId: candidates.id,
      candidateFirstName: candidates.firstName,
      candidateLastName: candidates.lastName,
      candidateEmail: candidates.email,
      jobTitle: jobs.title,
      subject: mailMessages.subject,
      body: mailMessages.textBody,
      fromEmail: mailMessages.fromEmail,
      readAt: mailMessages.readAt,
      createdAt: mailMessages.receivedAt,
    })
    .from(mailMessages)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, mailMessages.candidateId),
        eq(candidates.workspaceId, workspace.id),
        isNull(candidates.deletedAt),
      ),
    )
    .leftJoin(
      applications,
      and(
        eq(applications.id, mailMessages.applicationId),
        eq(applications.workspaceId, workspace.id),
      ),
    )
    .leftJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspace.id),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.direction, "inbound"),
        isNull(candidates.deletedAt),
      ),
    )
    .orderBy(desc(mailMessages.receivedAt))
    .limit(safeLimit);

  const attachmentRows = rows.length
    ? await db
        .select({
          messageId: mailAttachments.messageId,
          filename: mailAttachments.filename,
          contentType: mailAttachments.contentType,
          size: mailAttachments.size,
          storageKey: mailAttachments.storageKey,
        })
        .from(mailAttachments)
        .where(
          and(
            eq(mailAttachments.workspaceId, workspace.id),
            inArray(mailAttachments.messageId, rows.map((row) => row.id)),
          ),
        )
    : [];
  const attachmentsByMessage = new Map<string, InboundAttachment[]>();
  for (const attachment of attachmentRows) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    candidateName: `${row.candidateFirstName} ${row.candidateLastName}`.trim(),
    candidateEmail: row.candidateEmail,
    jobTitle: row.jobTitle,
    subject: row.subject,
    body: row.body,
    fromEmail: row.fromEmail,
    attachments: attachmentsByMessage.get(row.id) ?? [],
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getUnreadInboundReplyCount(): Promise<number> {
  const { organization: workspace } = await getWorkspaceContext();

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mailMessages)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, mailMessages.candidateId),
        eq(candidates.workspaceId, workspace.id),
      ),
    )
    .where(
      and(
        eq(mailMessages.workspaceId, workspace.id),
        eq(mailMessages.direction, "inbound"),
        isNull(candidates.deletedAt),
        isNull(mailMessages.readAt),
      ),
    );
  return row?.count ?? 0;
}
