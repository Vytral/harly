import type { InboxFilter, InboxThread } from "@/features/mailbox/data";

/** Translator passed in by callers; keys are full catalog paths. */
export type MailboxTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

const FILTER_LABEL_KEYS: Record<InboxFilter, string> = {
  all: "all",
  "needs-reply": "needsReply",
  replies: "replies",
  unassigned: "unassigned",
  unread: "unread",
  candidates: "candidates",
  assigned: "assigned",
  "assigned-to-me": "assignedToMe",
  archived: "archived",
};

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

/** Filters shown as tabs; the rest live behind "More". "Sent" has no server filter yet. */
export const PRIMARY_INBOX_FILTERS: InboxFilter[] = ["all", "unread", "needs-reply", "assigned-to-me", "candidates", "archived"];
export const MORE_INBOX_FILTERS: InboxFilter[] = ["replies", "unassigned", "assigned"];

export function inboxFilterLabel(value: InboxFilter, t: MailboxTranslator) {
  return t(`labels.mailbox.filters.${FILTER_LABEL_KEYS[value]}`);
}

/** Display name for whoever the thread is with. */
export function threadPersonName(
  thread: Pick<InboxThread, "candidateName" | "participantEmail">,
  t: MailboxTranslator,
) {
  return thread.candidateName ?? thread.participantEmail ?? t("labels.mailbox.unknownSender");
}

/** Plain-text search over what the list already holds (subject, person, messages). */
export function threadMatchesQuery(thread: InboxThread, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [thread.subject, thread.participantEmail, thread.candidateName, thread.jobTitle, thread.preview, thread.searchText].some(
    (value) => (value ?? "").toLocaleLowerCase().includes(needle),
  );
}
