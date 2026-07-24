import type { InboxFilter, InboxThread } from "@/features/mailbox/data";

export const inboxFilters: ReadonlyArray<[InboxFilter, string]> = [
  ["all", "All"],
  ["needs-reply", "Needs reply"],
  ["replies", "Replies"],
  ["unassigned", "Unassigned"],
  ["unread", "Unread"],
  ["candidates", "Candidates"],
  ["assigned", "Assigned"],
  ["assigned-to-me", "Assigned to me"],
  ["archived", "Archived"],
];

/**
 * `currentUserId` is only known client-side when passed in — without it,
 * "assigned to me" falls back to "assigned to anyone" so counts don't crash,
 * but callers with the id (RecruitingInbox) should always pass it.
 */
export function matchesInboxFilter(thread: InboxThread, filter: InboxFilter, currentUserId?: string) {
  switch (filter) {
    case "all":
      return thread.status === "open";
    case "needs-reply":
      return thread.status === "open" && thread.needsReply !== false;
    case "replies":
      return thread.status === "open" && thread.hasInboundReply !== false;
    case "unassigned":
      return thread.status === "open" && !thread.candidateId;
    case "unread":
      return thread.unreadCount > 0;
    case "candidates":
      return Boolean(thread.candidateId);
    case "assigned":
      return Boolean(thread.ownerName);
    case "assigned-to-me":
      return currentUserId ? thread.ownerId === currentUserId : Boolean(thread.ownerId);
    case "archived":
      return thread.status === "archived";
  }
}
