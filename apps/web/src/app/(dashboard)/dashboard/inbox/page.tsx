import { isDemoMode } from "@harly/config";

import { listEmailTemplates } from "@/features/email-templates/data";
import { RecruitingInbox } from "@/features/mailbox/RecruitingInbox";
import { getInboxData, getUnreadInboxThreadCount, normalizeInboxFilter } from "@/features/mailbox/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{ filter?: string | string[]; page?: string; thread?: string }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  await requirePagePermission("candidates:view");
  const query = await searchParams;
  const filter = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const page = Number.isFinite(Number(query.page)) ? Math.max(0, Number(query.page)) : 0;
  const [inbox, unreadTotal, templates, { organization, user }] = await Promise.all([
    getInboxData({ filter, page, threadId: query.thread }),
    // The badge and the tab share one count, so it must not depend on the active filter.
    getUnreadInboxThreadCount().catch(() => null),
    // Templates are a convenience: the inbox still works without them.
    listEmailTemplates().catch(() => []),
    getWorkspaceContext(),
  ]);
  const { threads, messages, hasMore, members, candidates, applications, mailboxStatus, currentUserId } = inbox;

  return (
    <RecruitingInbox
      threads={threads}
      messages={messages}
      selectedThreadId={query.thread}
      initialFilter={normalizeInboxFilter(filter)}
      page={page}
      hasMore={hasMore}
      members={members}
      candidates={candidates}
      applications={applications}
      mailboxStatus={mailboxStatus}
      currentUserId={currentUserId}
      unreadTotal={unreadTotal}
      templates={templates.map(({ id, name, type, subject, body }) => ({ id, name, type, subject, body }))}
      companyName={organization.name}
      senderName={user.name ?? ""}
      demoMode={isDemoMode()}
    />
  );
}
