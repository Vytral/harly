import {
  aliasedTable,
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";

import {
  candidates,
  db,
  mailAttachments,
  mailMessages,
  mailThreads,
} from "@harly/db";

export type WorkspaceMailboxAttachment = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};

const messageCandidate = aliasedTable(candidates, "mail_message_candidate");
const threadCandidate = aliasedTable(candidates, "mail_thread_candidate");
const activeMailboxMessageLink = and(
  or(isNull(mailMessages.candidateId), isNotNull(messageCandidate.id)),
  or(isNull(mailThreads.candidateId), isNotNull(threadCandidate.id)),
  or(
    isNull(mailMessages.candidateId),
    isNull(mailThreads.candidateId),
    eq(mailMessages.candidateId, mailThreads.candidateId),
  ),
);

function attachmentQuery(
  workspaceId: string,
  extraCondition: ReturnType<typeof and>,
  threadScope?: SQL,
) {
  return db
    .select({
      filename: mailAttachments.filename,
      contentType: mailAttachments.contentType,
      size: mailAttachments.size,
      storageKey: mailAttachments.storageKey,
    })
    .from(mailAttachments)
    .innerJoin(
      mailMessages,
      and(
        eq(mailMessages.id, mailAttachments.messageId),
        eq(mailMessages.workspaceId, workspaceId),
      ),
    )
    .innerJoin(
      mailThreads,
      and(
        eq(mailThreads.id, mailMessages.threadId),
        eq(mailThreads.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      messageCandidate,
      and(
        eq(messageCandidate.id, mailMessages.candidateId),
        eq(messageCandidate.workspaceId, workspaceId),
        isNull(messageCandidate.deletedAt),
      ),
    )
    .leftJoin(
      threadCandidate,
      and(
        eq(threadCandidate.id, mailThreads.candidateId),
        eq(threadCandidate.workspaceId, workspaceId),
        isNull(threadCandidate.deletedAt),
      ),
    )
    .where(
      and(
        eq(mailAttachments.workspaceId, workspaceId),
        activeMailboxMessageLink,
        extraCondition,
        threadScope,
      ),
    );
}

/**
 * `threadScope` is the role-scope predicate from `mailThreadScopeSql`; pass it
 * wherever the caller is a user whose role may be limited to some jobs.
 */
export async function getWorkspaceMailboxAttachment(input: {
  attachmentId: string;
  workspaceId: string;
  threadScope?: SQL;
}): Promise<WorkspaceMailboxAttachment | null> {
  const [attachment] = await attachmentQuery(
    input.workspaceId,
    eq(mailAttachments.id, input.attachmentId),
    input.threadScope,
  )
    .limit(1);
  return attachment ?? null;
}

export async function listWorkspaceMailboxAttachments(input: {
  messageId: string;
  workspaceId: string;
  threadScope?: SQL;
}): Promise<WorkspaceMailboxAttachment[]> {
  return attachmentQuery(
    input.workspaceId,
    eq(mailAttachments.messageId, input.messageId),
    input.threadScope,
  )
    .orderBy(asc(mailAttachments.createdAt));
}
