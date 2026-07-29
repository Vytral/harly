"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  SearchIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";
import { InboxConversationList } from "@/features/mailbox/InboxConversationList";
import { InboxNewThreadSheet } from "@/features/mailbox/InboxNewThreadSheet";
import { InboxPeopleList, type InboxPerson } from "@/features/mailbox/InboxPeopleList";
import { InboxThreadReader } from "@/features/mailbox/InboxThreadReader";
import { InboxActionsPanel } from "@/features/mailbox/InboxActionsPanel";
import { inboxFilters, matchesInboxFilter } from "@/features/mailbox/inbox-filters";
import type { InboxApplication, InboxCandidate, InboxFilter, InboxMailboxStatus, InboxMember, InboxMessage, InboxThread } from "@/features/mailbox/data";
import {
  createCandidateFromMailboxThreadAction,
  linkMailboxThreadToApplicationAction,
  linkMailboxThreadToCandidateAction,
  markInboxThreadReadAction,
  replyMailboxThreadAction,
  retryMailboxSyncAction,
  summarizeMailboxThreadAction,
  suggestMailboxReplyAction,
  updateMailboxThreadAction,
} from "@/features/mailbox/actions";

const PRIMARY_FILTERS: InboxFilter[] = ["all", "needs-reply", "unread", "assigned-to-me", "archived"];
const MORE_FILTERS: InboxFilter[] = ["replies", "unassigned", "candidates", "assigned"];

function filterLabel(value: InboxFilter) {
  return inboxFilters.find(([key]) => key === value)?.[1] ?? "All";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function personKey(thread: InboxThread) {
  if (thread.candidateId) return `candidate:${thread.candidateId}`;
  if (thread.participantEmail) return `email:${thread.participantEmail.trim().toLocaleLowerCase()}`;
  return `thread:${thread.id}`;
}

function personName(thread: InboxThread) {
  return thread.candidateName ?? thread.participantEmail ?? "Unknown sender";
}

function ConnectionStrip({ status }: { status: InboxMailboxStatus }) {
  const conflict = status.route === "conflict";
  const title = conflict
    ? "Two incoming email routes are enabled"
    : "Incoming email is not connected yet";
  const description = conflict
    ? "A shared mailbox and a webhook are both on. Choose one to avoid duplicate conversations."
    : "Connect a shared mailbox or threaded replies so candidate messages land here.";

  return (
    <div
      role={conflict ? "alert" : "status"}
      className="flex items-center gap-2.5 border-b border-warning/25 bg-warning/[0.06] px-4 py-2 text-xs"
    >
      <WarningCircleIcon className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-foreground">{title}.</span>{" "}
        <span className="text-muted-foreground">{description}</span>
      </p>
      <Link
        href="/settings/email/replies"
        className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-primary"
      >
        Email settings
      </Link>
    </div>
  );
}

function InboxCommandBar({
  filter,
  counts,
  query,
  onQueryChange,
  onFilterChange,
  syncing,
  onRefresh,
  searchRef,
}: {
  filter: InboxFilter;
  counts: Record<InboxFilter, number>;
  query: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (filter: InboxFilter) => void;
  syncing: boolean;
  onRefresh: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const moreActive = MORE_FILTERS.includes(filter);

  const FilterButton = ({ value }: { value: InboxFilter }) => {
    const isActive = filter === value;
    const count = counts[value] ?? 0;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onFilterChange(value)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:active:scale-100",
          isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {filterLabel(value)}
        {count > 0 ? (
          <span className={cn("tabular-nums", isActive ? "text-primary-foreground/70" : "text-muted-foreground/60")}>{count}</span>
        ) : null}
      </button>
    );
  };

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border/70 pl-3 pr-4">
      <label className="relative flex w-full shrink-0 items-center lg:w-[328px]">
        <span className="sr-only">Search conversations</span>
        <SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search mail"
          className="h-9 w-full rounded-md border border-transparent bg-muted/50 pl-8 pr-3 text-sm outline-none transition-[border-color,background-color] placeholder:text-muted-foreground/70 hover:bg-muted focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
        />
      </label>

      <nav role="tablist" aria-label="Inbox filters" className="ml-auto hidden min-w-0 items-center gap-1 overflow-x-auto sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRIMARY_FILTERS.map((value) => <FilterButton key={value} value={value} />)}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                moreActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {moreActive ? filterLabel(filter) : "More"}
              <CaretDownIcon className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            {MORE_FILTERS.map((value) => {
              const isActive = filter === value;
              const count = counts[value] ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFilterChange(value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  {filterLabel(value)}
                  {count > 0 ? <span className="tabular-nums text-xs text-muted-foreground">{count}</span> : null}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </nav>

      <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 active:scale-[0.97] motion-reduce:active:scale-100" onClick={onRefresh} disabled={syncing} aria-label="Check for new messages" title="Check for new messages">
        <ArrowsClockwiseIcon className={cn("size-4", syncing && "animate-spin motion-reduce:animate-none")} />
      </Button>
    </header>
  );
}

function InboxEmptyState({ status, filter }: { status: InboxMailboxStatus; filter: InboxFilter }) {
  const isFiltered = filter !== "all";
  const isConnected = status.enabled && status.configured && status.route !== "conflict";
  const address = status.address ?? (status.replyDomain ? `your address at ${status.replyDomain}` : null);

  if (isFiltered) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <EnvelopeIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold">No conversations in this view</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">This filter is empty right now. Switch back to All to see every conversation.</p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/dashboard/inbox">View all conversations</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-lg text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <EnvelopeIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold">Connect incoming email to start receiving replies</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose a shared mailbox or threaded replies in Email settings. Once connected, candidate replies become conversations here.</p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/settings/email/replies">Set up incoming email</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircleIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">Your inbox is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">No candidate has replied yet. When they reply to a Harly email, the message appears here automatically.</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Send an email", "Contact a candidate from Harly."],
            ["2", "Candidate replies", "Their reply goes to your Harly address."],
            ["3", "Review here", "The conversation appears in this Inbox."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3.5 text-left">
              <span className="font-mono text-xs font-semibold text-primary">{step}</span>
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>

        {address ? (
          <div className="mt-4 rounded-lg border border-border/70 bg-background px-4 py-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Reply address</p>
            <p className="mt-1 break-all font-mono text-sm text-foreground">{address}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecruitingInbox({
  threads,
  messages,
  selectedThreadId: initialThreadId,
  initialFilter,
  page = 0,
  hasMore = false,
  members,
  candidates,
  applications,
  mailboxStatus,
  currentUserId,
}: {
  threads: InboxThread[];
  messages: Record<string, InboxMessage[]>;
  selectedThreadId?: string;
  initialFilter?: InboxFilter;
  page?: number;
  hasMore?: boolean;
  members: InboxMember[];
  candidates: InboxCandidate[];
  applications: InboxApplication[];
  mailboxStatus: InboxMailboxStatus;
  currentUserId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter ?? "all");
  const [query, setQuery] = useState("");
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | undefined>(() => {
    const initialThread = initialThreadId ? threads.find((item) => item.id === initialThreadId) : threads[0];
    return initialThread ? personKey(initialThread) : undefined;
  });
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(initialThreadId ?? Object.keys(messages)[0]);
  const [mobileView, setMobileView] = useState<"people" | "conversations" | "thread">(initialThreadId ? "thread" : "people");
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState<{ threadId: string; body: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  // The URL (initialFilter/initialThreadId) is the source of truth; local
  // state only needs to resync when those props actually change, not on
  // every re-render. Adjusting state during render , guarded by tracking the
  // previous prop value , avoids the extra commit an effect-based sync would
  // cause (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setFilter(initialFilter ?? "all");
  }

  const [prevInitialThreadId, setPrevInitialThreadId] = useState(initialThreadId);
  if (initialThreadId !== prevInitialThreadId) {
    setPrevInitialThreadId(initialThreadId);
    if (initialThreadId) {
      const initialThread = threads.find((item) => item.id === initialThreadId);
      setActiveThreadId(initialThreadId);
      setSelectedPersonKey(initialThread ? personKey(initialThread) : undefined);
      setMobileView("thread");
    }
  }

  const connectionActive = mailboxStatus.enabled && mailboxStatus.configured && mailboxStatus.route !== "conflict";
  const showConnectionStrip = !connectionActive && threads.length > 0;

  const counts = useMemo(() => {
    const record = {} as Record<InboxFilter, number>;
    for (const [value] of inboxFilters) record[value] = threads.filter((item) => matchesInboxFilter(item, value, currentUserId)).length;
    return record;
  }, [threads, currentUserId]);

  const normalizedQuery = normalizeSearch(query);
  const searched = useMemo(() => {
    const byFilter = threads.filter((item) => matchesInboxFilter(item, filter, currentUserId));
    if (!normalizedQuery) return byFilter;
    return byFilter.filter((item) =>
      [item.subject, item.participantEmail, item.candidateName, item.preview, item.searchText]
        .filter(Boolean)
        .some((value) => normalizeSearch(value ?? "").includes(normalizedQuery)),
    );
  }, [threads, filter, normalizedQuery, currentUserId]);

  const people = useMemo(() => {
    const grouped = new Map<string, InboxPerson>();
    for (const item of searched) {
      const key = personKey(item);
      const current = grouped.get(key);
      if (current) {
        current.threadCount += 1;
        current.unreadCount += item.unreadCount;
        if (new Date(item.lastMessageAt).getTime() > new Date(current.lastMessageAt).getTime()) current.lastMessageAt = item.lastMessageAt;
        continue;
      }
      grouped.set(key, {
        key,
        candidateId: item.candidateId,
        name: personName(item),
        email: item.participantEmail,
        avatarUrl: item.candidateAvatarUrl,
        threadCount: 1,
        unreadCount: item.unreadCount,
        lastMessageAt: item.lastMessageAt,
      });
    }
    return [...grouped.values()].sort((left, right) => {
      const unreadSort = Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
      return unreadSort || new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
    });
  }, [searched]);

  const thread = activeThreadId ? threads.find((item) => item.id === activeThreadId) : undefined;
  const activePersonKey = thread ? personKey(thread) : people.some((item) => item.key === selectedPersonKey) ? selectedPersonKey : people[0]?.key;
  const personThreads = activePersonKey ? searched.filter((item) => personKey(item) === activePersonKey) : [];
  const threadMessages = thread ? (messages[thread.id] ?? []) : [];

  async function runAction<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, success: string) {
    try {
      const result = await fn();
      if (result.ok) {
        setAnnouncement(success);
        router.refresh();
      } else setAnnouncement(result.error ?? "Action failed.");
      return result;
    } catch {
      const result = { ok: false, error: "You do not have permission to change this thread." } as T;
      setAnnouncement(result.error ?? "Action failed.");
      return result;
    }
  }

  function handleMarkRead(target: InboxThread) {
    startTransition(() => { void runAction(() => markInboxThreadReadAction({ threadId: target.id, source: target.source }), `Marked “${target.subject}” as read.`); });
  }

  function handleSelectPerson(person: InboxPerson) {
    setSelectedPersonKey(person.key);
    setActiveThreadId(undefined);
    setMobileView("conversations");
    const params = new URLSearchParams(window.location.search);
    params.delete("thread");
    router.push(`/dashboard/inbox?${params.toString()}`);
  }

  function handleSelectThread(target: InboxThread) {
    setSelectedPersonKey(personKey(target));
    setActiveThreadId(target.id);
    setMobileView("thread");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", target.id);
    router.push(`/dashboard/inbox?${params.toString()}`);
    if (target.unreadCount) {
      startTransition(() => { void runAction(() => markInboxThreadReadAction({ threadId: target.id, source: target.source }), `Marked “${target.subject}” as read.`); });
    }
  }

  function handleBackToThreads() {
    setActiveThreadId(undefined);
    setMobileView("conversations");
    const params = new URLSearchParams(window.location.search);
    params.delete("thread");
    router.push(`/dashboard/inbox?${params.toString()}`);
  }

  function handleNewThreadSent(newThreadId: string) {
    setNewThreadOpen(false);
    setActiveThreadId(newThreadId);
    setMobileView("thread");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", newThreadId);
    router.push(`/dashboard/inbox?${params.toString()}`);
    router.refresh();
  }

  async function retrySync() {
    setSyncing(true);
    const result = await retryMailboxSyncAction().catch(() => ({ ok: false as const, error: "You do not have permission to sync the mailbox." }));
    setAnnouncement(result.ok ? `Sync complete. Imported ${"imported" in result ? result.imported : 0} messages; skipped ${"skipped" in result ? result.skipped : 0} duplicates.` : result.error ?? "Sync failed.");
    setSyncing(false);
    router.refresh();
  }

  function handleRefresh() {
    if (mailboxStatus.route === "mailbox" && mailboxStatus.enabled) void retrySync();
    else router.refresh();
  }

  function handleFilterChange(next: InboxFilter) {
    setFilter(next);
    setActiveThreadId(undefined);
    setMobileView("people");
    router.push(`/dashboard/inbox?filter=${next}`);
  }

  const contextThread = thread ?? personThreads[0];
  const contextPerson = people.find((item) => item.key === activePersonKey);
  const actionsPanel = contextThread ? (
    <InboxActionsPanel
      thread={contextThread}
      members={members}
      candidates={candidates}
      applications={applications}
      isPending={pending}
      onAssign={(ownerId) => runAction(() => updateMailboxThreadAction({ threadId: contextThread.id, ownerId }), ownerId ? "Thread assigned." : "Thread unassigned.")}
      onCandidateChange={(candidateId) => runAction(() => linkMailboxThreadToCandidateAction({ threadId: contextThread.id, candidateId }), candidateId ? "Candidate linked." : "Candidate unlinked.")}
      onApplicationChange={(applicationId) => runAction(() => linkMailboxThreadToApplicationAction({ threadId: contextThread.id, applicationId: applicationId ?? null }), applicationId ? "Application linked." : "Application unlinked.")}
      onCreateCandidate={() => { startTransition(() => { void runAction(() => createCandidateFromMailboxThreadAction({ threadId: contextThread.id }), "Candidate created from this thread."); }); }}
      onArchive={() => { startTransition(() => { void runAction(() => updateMailboxThreadAction({ threadId: contextThread.id, status: "archived" }), "Thread archived."); }); }}
      onMarkSpam={() => { startTransition(() => { void runAction(() => updateMailboxThreadAction({ threadId: contextThread.id, status: "spam" }), "Thread marked as spam."); }); }}
      onSummarize={() => summarizeMailboxThreadAction({ threadId: contextThread.id })}
      onSuggestReply={() => suggestMailboxReplyAction({ threadId: contextThread.id }).then((result) => { if (result.ok && result.draft) setSuggestedReply({ threadId: contextThread.id, body: result.draft.body }); return result; })}
    />
  ) : null;

  return (
    <div className="-mx-4 -mb-6 -mt-2 flex h-[calc(100%+2rem)] min-h-0 flex-col overflow-hidden border-t border-border/70 duration-300 animate-in fade-in md:-mx-6 lg:-mx-8 lg:-mb-8 lg:-mt-3 lg:h-[calc(100%+2.75rem)]">
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <InboxCommandBar
        filter={filter}
        counts={counts}
        query={query}
        onQueryChange={setQuery}
        onFilterChange={handleFilterChange}
        syncing={syncing}
        onRefresh={handleRefresh}
        searchRef={searchRef}
      />
      {showConnectionStrip ? <ConnectionStrip status={mailboxStatus} /> : null}

      {!threads.length ? (
        <InboxEmptyState status={mailboxStatus} filter={filter} />
      ) : (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className={cn("min-h-0 shrink-0 border-r border-border/70 bg-card", mobileView === "people" ? "block w-full lg:w-[280px]" : "hidden lg:block lg:w-[280px]")}>
            <InboxPeopleList people={people} selectedKey={activePersonKey} query={query} onSelect={handleSelectPerson} />
          </div>

          <div className={cn("min-h-0 min-w-0 flex-1 bg-background", mobileView === "people" ? "hidden lg:block" : "block")}>
            {thread ? (
              <InboxThreadReader
                key={`${thread.id}-${suggestedReply?.threadId === thread.id ? suggestedReply.body : ""}`}
                thread={thread}
                messages={threadMessages}
                isPending={pending}
                canReply={mailboxStatus.canReply}
                suggestedReply={suggestedReply?.threadId === thread.id ? suggestedReply.body : null}
                onBack={handleBackToThreads}
                onMarkRead={handleMarkRead}
                onSendReply={(payload) => replyMailboxThreadAction({ threadId: thread.id, body: payload.body, html: payload.html, subject: payload.subject, idempotencyKey: payload.idempotencyKey, attachments: payload.attachments.map((file) => ({ filename: file.filename, contentType: file.contentType, base64: file.base64 })) }).then((result) => { if (result.ok) { setAnnouncement(result.sentCopySaved === false ? "Reply sent, but the copy could not be saved in Sent." : "Reply sent."); router.refresh(); } return result; })}
                actionsSlot={actionsPanel}
              />
            ) : (
              <InboxConversationList
                person={contextPerson}
                threads={personThreads}
                query={query}
                onSelect={handleSelectThread}
                onNewThread={contextPerson?.email ? () => setNewThreadOpen(true) : undefined}
              />
            )}
          </div>

          <aside className="hidden min-h-0 shrink-0 border-l border-border/70 bg-muted/15 lg:block lg:w-[300px] xl:w-[320px]" aria-label="Candidate details and actions">
            {actionsPanel}
          </aside>
        </div>
      )}

      {hasMore ? (
        <div className="flex shrink-0 justify-center border-t border-border/70 py-2.5">
          <button
            type="button"
            className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => { const params = new URLSearchParams(window.location.search); params.set("page", String((page ?? 0) + 1)); params.delete("thread"); router.push(`/dashboard/inbox?${params.toString()}`); }}
          >
            Load more conversations
          </button>
        </div>
      ) : null}

      <InboxNewThreadSheet person={contextPerson} open={newThreadOpen} onOpenChange={setNewThreadOpen} onSent={handleNewThreadSent} />
    </div>
  );
}
