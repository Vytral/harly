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
  const { threads, messages, hasMore } = await getInboxData({
    filter,
    page,
    threadId: query.thread,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <RecruitingInbox
        threads={threads}
        messages={messages}
        initialFilter={normalizeInboxFilter(filter)}
        page={page}
        hasMore={hasMore}
      />
    </div>
  );
}
