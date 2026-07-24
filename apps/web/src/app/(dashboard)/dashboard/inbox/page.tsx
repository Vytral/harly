import { RecruitingInbox } from "@/features/mailbox/RecruitingInbox";
import { getInboxData, normalizeInboxFilter } from "@/features/mailbox/data";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{ filter?: string | string[]; page?: string; thread?: string }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const query = await searchParams;
  const filter = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const page = Number.isFinite(Number(query.page)) ? Math.max(0, Number(query.page)) : 0;
  const { threads, messages, hasMore, members, candidates, applications, mailboxStatus, currentUserId } = await getInboxData({
    filter,
    page,
    threadId: query.thread,
  });

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
    />
  );
}
