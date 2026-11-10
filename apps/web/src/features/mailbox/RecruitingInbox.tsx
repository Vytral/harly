"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  PlusIcon,
  SearchIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Kbd, useShortcut } from "@/components/dashboard/shortcuts";
import { isOverlayOpen } from "@/components/dashboard/shortcuts/useShortcut";
import { shouldHandleKeyEvent } from "@/components/dashboard/shortcuts/matcher";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";
import { InboxConversationList } from "@/features/mailbox/InboxConversationList";
import { InboxNewThreadSheet, type InboxPerson } from "@/features/mailbox/InboxNewThreadSheet";
import { InboxThreadReader } from "@/features/mailbox/InboxThreadReader";
import { InboxActionsPanel } from "@/features/mailbox/InboxActionsPanel";
import {
  MORE_INBOX_FILTERS,
  PRIMARY_INBOX_FILTERS,
  inboxFilterLabel,
  matchesInboxFilter,
  threadMatchesQuery,
  threadPersonName,
} from "@/features/mailbox/inbox-filters";
import { buildInboxTemplates, type InboxTemplateSource } from "@/features/mailbox/inbox-templates";
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

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

function inboxUrl(mutate: (params: URLSearchParams) => void): Route {
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const query = params.toString();
  return (query ? `/dashboard/inbox?${query}` : "/dashboard/inbox") as Route;
}

function ConnectionStrip({ status, onRetry, retrying }: { status: InboxMailboxStatus; onRetry: () => void; retrying: boolean }) {
  const conflict = status.route === "conflict";
  const connected = status.enabled && status.configured && !conflict;
  const syncFailed = connected && Boolean(status.lastError);
  const t = useTranslations("features.mailbox.recruitingInbox.connectionStrip");
  const title = conflict
    ? t("conflictTitle")
    : syncFailed
      ? t("syncFailedTitle")
      : t("notConnectedTitle");
  const description = conflict
    ? t("conflictDescription")
    : syncFailed
      ? t("syncFailedDescription")
      : t("notConnectedDescription");

  return (
    <div
      role={conflict || syncFailed ? "alert" : "status"}
      className="mx-3 mt-3 flex shrink-0 items-center gap-2.5 rounded-[var(--radius-inner)] bg-warning/10 px-4 py-2.5 text-xs"
    >
      <WarningCircleIcon className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 sm:truncate">
        <span className="font-semibold text-foreground">{title}</span>{" "}
        <span className="text-muted-foreground">{description}</span>
      </p>
      {syncFailed ? (
        <button type="button" onClick={onRetry} disabled={retrying} className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-soft-ink disabled:opacity-50">
          {retrying ? t("retrying") : t("retry")}
        </button>
      ) : null}
      <Link href="/settings/email/replies" className="shrink-0 font-semibold text-foreground underline underline-offset-4 hover:text-soft-ink">
        {t("emailSettings")}
      </Link>
    </div>
  );
}

const pillBase = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink motion-reduce:active:scale-100";
const pillOn = "bg-near-ink text-pure-snow";
const pillOff = "bg-soft-kraft text-soft-ink hover:bg-row-wash hover:text-near-ink";

function FilterTabs({
  filter,
  activeCount,
  hasMore,
  unreadTotal,
  onChange,
}: {
  filter: InboxFilter;
  activeCount: number;
  hasMore: boolean;
  unreadTotal: number | null;
  onChange: (filter: InboxFilter) => void;
}) {
  const moreActive = MORE_INBOX_FILTERS.includes(filter);
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useTranslations("features.mailbox.recruitingInbox.filterTabs");
  const tRoot = useTranslations();

  // Only the active view's count is known (the server returns one view at a
  // time); unread has its own total. Showing a count on every tab would lie.
  function countFor(value: InboxFilter) {
    if (value === "unread" && unreadTotal !== null) return unreadTotal;
    if (value === filter) return activeCount;
    return 0;
  }

  return (
    <nav
      role="tablist"
      aria-label={t("filters")}
      className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PRIMARY_INBOX_FILTERS.map((value) => {
        const active = filter === value;
        const count = countFor(value);
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="inbox-conversations"
            onClick={() => onChange(value)}
            className={cn(pillBase, active ? pillOn : pillOff)}
          >
            {inboxFilterLabel(value, tRoot)}
            {count > 0 ? (
              <span className={cn("tabular-nums", active ? "text-pure-snow/70" : value === "unread" ? "font-semibold text-near-ink" : "text-quiet-mist")}>
                {count}
                {active && hasMore && value === filter ? "+" : ""}
              </span>
            ) : null}
          </button>
        );
      })}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(pillBase, "gap-1", moreActive ? pillOn : pillOff)} aria-label={t("moreFilters")}>
            {moreActive ? inboxFilterLabel(filter, tRoot) : t("more")}
            <CaretDownIcon className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          {MORE_INBOX_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMoreOpen(false); onChange(value); }}
              className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors", filter === value ? "bg-lime-wash text-near-ink" : "hover:bg-row-wash")}
            >
              {inboxFilterLabel(value, tRoot)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </nav>
  );
}

function InboxEmptyState({ status, demoMode = false }: { status: InboxMailboxStatus; demoMode?: boolean }) {
  const t = useTranslations("features.mailbox.recruitingInbox.emptyState");
  const isConnected = demoMode || (status.enabled && status.configured && status.route !== "conflict");

  if (!isConnected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-lg text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-[var(--radius-inner)] bg-warning/10 text-warning">
            <EnvelopeIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold">{t("connectTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("connectDescription")}</p>
          <Button asChild className="mt-5" size="sm">
            <Link href="/settings/email/replies">{t("setUp")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-[var(--radius-inner)] bg-lime-wash text-success-olive">
            <CheckCircleIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">{t("readyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("readyDescription")}</p>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["1", t("sendTitle"), t("sendDescription")],
            ["2", t("repliesTitle"), t("repliesDescription")],
            ["3", t("reviewTitle"), t("reviewDescription")],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-[var(--radius-inner)] bg-card-inset px-4 py-3.5 text-left">
              <span className="font-mono text-xs font-semibold text-success-olive">{step}</span>
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReaderPlaceholder() {
  const t = useTranslations("features.mailbox.recruitingInbox.readerPlaceholder");
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-[var(--radius-inner)] bg-card-inset text-soft-ink">
        <EnvelopeIcon className="size-5" />
      </span>
      <h2 className="mt-4 text-sm font-semibold">{t("title")}</h2>
      <p className="mt-1.5 max-w-xs text-xs leading-5 text-soft-ink">{t("description")}</p>
      <dl className="mt-5 grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-2 text-xs text-soft-ink">
        {[
          ["J / K", t("next")],
          ["R", t("reply")],
          ["E", t("archive")],
          ["/", t("search")],
        ].map(([key, label]) => (
          <div key={key} className="contents">
            <dt className="justify-self-end"><Kbd>{key}</Kbd></dt>
            <dd className="justify-self-start">{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const noopSubscribe = () => () => {};

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
  unreadTotal = null,
  templates = [],
  companyName = "",
  senderName = "",
  demoMode = false,
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
  /** Workspace-wide unread conversations, independent of the active filter. */
  unreadTotal?: number | null;
  templates?: InboxTemplateSource[];
  companyName?: string;
  senderName?: string;
  /** Public demo: email is intentionally unwired, so hide "not connected" setup nudges. */
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter ?? "all");
  const [query, setQuery] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(initialThreadId ?? Object.keys(messages)[0]);
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialThreadId ? "thread" : "list");
  const [newThread, setNewThread] = useState<"closed" | "person" | "pick">("closed");
  const [contextOpen, setContextOpen] = useState(false);
  const [composerThreadId, setComposerThreadId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState<{ threadId: string; body: string } | null>(null);
  // Optimistic read state: thread id -> unread count at the time it was opened.
  // A later message raises unreadCount above it, so the dot comes back.
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [navPending, startNav] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const autoReadRef = useRef<Set<string>>(new Set());
  const t = useTranslations("features.mailbox.recruitingInbox.main");
  const tRoot = useTranslations();
  const locale = useLocale();

  // The URL (initialFilter/initialThreadId) is the source of truth; local
  // state resyncs when those props change (back/forward), by adjusting state
  // during render instead of an effect.
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setFilter(initialFilter ?? "all");
  }
  const [prevInitialThreadId, setPrevInitialThreadId] = useState(initialThreadId);
  if (initialThreadId !== prevInitialThreadId) {
    setPrevInitialThreadId(initialThreadId);
    if (initialThreadId) {
      setActiveThreadId(initialThreadId);
      setMobileView("thread");
    } else {
      setMobileView("list");
    }
  }

  // Locale/timezone formatting only after hydration, so server markup matches.
  const lastSyncedLabel = useSyncExternalStore(
    noopSubscribe,
    () => (mailboxStatus.lastSyncedAt ? new Date(mailboxStatus.lastSyncedAt).toLocaleString(locale) : null),
    () => null,
  );
  const connectionActive = mailboxStatus.enabled && mailboxStatus.configured && mailboxStatus.route !== "conflict";
  const showConnectionStrip = !demoMode && (!connectionActive || Boolean(mailboxStatus.lastError)) && (threads.length > 0 || Boolean(mailboxStatus.lastError));

  // Resolve the open thread: the requested one when present, else the one the
  // server preloaded messages for (it opens on the newest conversation).
  const effectiveId = activeThreadId && threads.some((item) => item.id === activeThreadId) ? activeThreadId : Object.keys(messages).find((id) => threads.some((item) => item.id === id));
  const thread = effectiveId ? threads.find((item) => item.id === effectiveId) : undefined;

  const isUnread = (item: InboxThread) => item.unreadCount > 0 && item.unreadCount > (readAt[item.id] ?? 0);

  // The open conversation stays listed even when it no longer matches (e.g. it
  // just left Unread by being read), so the list never swaps under the reader.
  const searched = useMemo(
    () => threads.filter((item) => item.id === effectiveId || (matchesInboxFilter(item, filter, currentUserId) && threadMatchesQuery(item, query))),
    [threads, filter, query, currentUserId, effectiveId],
  );
  const messagesReady = thread ? messages[thread.id] !== undefined : false;
  const threadMessages = thread ? (messages[thread.id] ?? []) : [];

  const composerTemplates = useMemo(() => {
    if (!thread) return [];
    const [first = "", ...rest] = (thread.candidateName ?? "").split(" ");
    return buildInboxTemplates(templates, {
      candidate_first_name: first,
      candidate_last_name: rest.join(" "),
      candidate_full_name: thread.candidateName ?? "",
      job_title: thread.jobTitle ?? "",
      stage_name: thread.applicationStageName ?? "",
      company_name: companyName,
      sender_name: senderName,
    });
  }, [thread, templates, companyName, senderName]);

  async function runAction<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, success: string, { quiet = false }: { quiet?: boolean } = {}) {
    try {
      const result = await fn();
      if (result.ok) {
        if (!quiet) setAnnouncement(success);
        router.refresh();
      } else {
        const message = result.error ?? t("actionFailed");
        setAnnouncement(message);
        toast.error(message);
      }
      return result;
    } catch {
      const result = { ok: false, error: t("noPermissionThread") } as T;
      setAnnouncement(result.error ?? t("actionFailed"));
      toast.error(result.error ?? t("actionFailed"));
      return result;
    }
  }

  function markRead(target: InboxThread, { quiet = false }: { quiet?: boolean } = {}) {
    setReadAt((current) => ({ ...current, [target.id]: target.unreadCount }));
    startTransition(() => { void runAction(() => markInboxThreadReadAction({ threadId: target.id, source: target.source }), t("markedRead", { subject: target.subject }), { quiet }); });
  }

  // A conversation that is on screen counts as read, including the one the
  // server preloads when nothing was chosen. On phones the list is what shows.
  useEffect(() => {
    if (!thread || !messagesReady || !isUnread(thread) || autoReadRef.current.has(thread.id)) return;
    if (!isDesktop() && mobileView !== "thread") return;
    autoReadRef.current.add(thread.id);
    // Server only: the dot clears when the refresh lands, so no state is set here.
    const target = thread;
    startTransition(() => { void runAction(() => markInboxThreadReadAction({ threadId: target.id, source: target.source }), "", { quiet: true }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAction/isUnread read the latest render's state
  }, [thread, messagesReady, mobileView]);

  function selectThread(target: InboxThread, { replace = false }: { replace?: boolean } = {}) {
    setActiveThreadId(target.id);
    setMobileView("thread");
    setComposerThreadId(null);
    const url = inboxUrl((params) => params.set("thread", target.id));
    startNav(() => {
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    });
    if (isUnread(target)) {
      autoReadRef.current.add(target.id);
      markRead(target, { quiet: true });
    }
  }

  function step(delta: 1 | -1) {
    if (!searched.length) return;
    const index = searched.findIndex((item) => item.id === effectiveId);
    const target = index < 0 ? searched[0] : searched[index + delta];
    if (target) selectThread(target, { replace: true });
  }

  function clearSelection() {
    setActiveThreadId(undefined);
    setMobileView("list");
    startNav(() => router.replace(inboxUrl((params) => params.delete("thread")), { scroll: false }));
  }

  function toggleArchive(target: InboxThread) {
    const archiving = target.status !== "archived";
    const index = searched.findIndex((item) => item.id === target.id);
    const next = searched[index + 1] ?? searched[index - 1];
    startTransition(() => {
      void (async () => {
        const result = await runAction(
          () => updateMailboxThreadAction({ threadId: target.id, status: archiving ? "archived" : "open" }),
          archiving ? t("conversationArchived") : t("movedBack"),
          { quiet: true },
        );
        if (!result.ok) return;
        toast(archiving ? t("conversationArchivedToast") : t("movedBackToast"), {
          action: archiving
            ? { label: t("undo"), onClick: () => { void runAction(() => updateMailboxThreadAction({ threadId: target.id, status: "open" }), t("archiveUndone"), { quiet: true }); } }
            : undefined,
        });
        if (target.id !== effectiveId) return;
        // Move on like a mail client: the next conversation on desktop, the list on phones.
        if (next && isDesktop()) selectThread(next, { replace: true });
        else clearSelection();
      })();
    });
  }

  function openReply() {
    if (thread) setComposerThreadId(thread.id);
  }

  const canReplyHere = Boolean(thread && mailboxStatus.canReply && thread.participantEmail);
  useShortcut("inbox.next", () => step(1));
  useShortcut("inbox.prev", () => step(-1));
  useShortcut("inbox.reply", openReply, { enabled: canReplyHere });
  useShortcut("inbox.archive", () => { if (thread) toggleArchive(thread); }, { enabled: Boolean(thread) && thread?.status !== "spam" });

  // "/" focuses search here instead of opening the command menu. Registered in
  // the capture phase so it wins over the global binding while Inbox is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || !shouldHandleKeyEvent(event, isOverlayOpen())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  async function retrySync() {
    setSyncing(true);
    const result = await retryMailboxSyncAction().catch(() => ({ ok: false as const, error: t("noPermissionSync") }));
    const message = result.ok ? t("syncComplete", { imported: "imported" in result ? result.imported : 0, skipped: "skipped" in result ? result.skipped : 0 }) : result.error ?? t("syncFailed");
    setAnnouncement(message);
    if (result.ok) toast.success(t("mailboxSynced"));
    else toast.error(message);
    setSyncing(false);
    router.refresh();
  }

  function handleRefresh() {
    if (mailboxStatus.route === "mailbox" && mailboxStatus.enabled) void retrySync();
    else startNav(() => router.refresh());
  }

  function handleFilterChange(next: InboxFilter) {
    setFilter(next);
    setActiveThreadId(undefined);
    setMobileView("list");
    startNav(() => router.push((next === "all" ? "/dashboard/inbox" : `/dashboard/inbox?filter=${next}`) as Route));
  }

  function handleNewThreadSent(newThreadId: string) {
    setNewThread("closed");
    setActiveThreadId(newThreadId);
    setMobileView("thread");
    toast.success(t("emailSent"));
    startNav(() => router.push(inboxUrl((params) => params.set("thread", newThreadId)), { scroll: false }));
    router.refresh();
  }

  const contextPerson: InboxPerson | undefined = thread?.participantEmail
    ? { candidateId: thread.candidateId, name: threadPersonName(thread, tRoot), email: thread.participantEmail }
    : undefined;
  const newThreadTemplates = useMemo(() => {
    const name = newThread === "person" && contextPerson ? contextPerson.name : "";
    const [first = "", ...rest] = name.split(" ");
    return buildInboxTemplates(templates, { candidate_first_name: first, candidate_last_name: rest.join(" "), candidate_full_name: name, company_name: companyName, sender_name: senderName });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recipient name is the only varying input
  }, [templates, companyName, senderName, newThread, contextPerson?.name]);

  const actionsPanel = thread ? (
    <InboxActionsPanel
      key={thread.id}
      thread={thread}
      members={members}
      candidates={candidates}
      applications={applications}
      isPending={pending}
      onAssign={(ownerId) => runAction(() => updateMailboxThreadAction({ threadId: thread.id, ownerId }), ownerId ? t("threadAssigned") : t("threadUnassigned"))}
      onCandidateChange={(candidateId) => runAction(() => linkMailboxThreadToCandidateAction({ threadId: thread.id, candidateId }), candidateId ? t("candidateLinked") : t("candidateUnlinked"))}
      onApplicationChange={(applicationId) => runAction(() => linkMailboxThreadToApplicationAction({ threadId: thread.id, applicationId: applicationId ?? null }), applicationId ? t("applicationLinked") : t("applicationUnlinked"))}
      onCreateCandidate={() => { startTransition(() => { void runAction(() => createCandidateFromMailboxThreadAction({ threadId: thread.id }), t("candidateCreated")); }); }}
      onArchive={() => toggleArchive(thread)}
      onMarkSpam={() => { startTransition(() => { void runAction(() => updateMailboxThreadAction({ threadId: thread.id, status: "spam" }), t("markedSpam")).then((result) => { if (result.ok) clearSelection(); }); }); }}
      onNewEmail={contextPerson ? () => { setContextOpen(false); setNewThread("person"); } : undefined}
      onSummarize={() => summarizeMailboxThreadAction({ threadId: thread.id })}
      onSuggestReply={() => suggestMailboxReplyAction({ threadId: thread.id }).then((result) => { if (result.ok && result.draft) { setSuggestedReply({ threadId: thread.id, body: result.draft.body }); setContextOpen(false); setComposerThreadId(thread.id); } return result; })}
    />
  ) : null;

  const fullEmpty = !threads.length && filter === "all";
  const listLabel = inboxFilterLabel(filter, tRoot);

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)] duration-300 animate-in fade-in-0 motion-reduce:animate-none">
      <div aria-live="polite" className="sr-only">{announcement}</div>

      {fullEmpty ? (
        <InboxEmptyState status={mailboxStatus} demoMode={demoMode} />
      ) : (
        <>
          {showConnectionStrip ? <ConnectionStrip status={mailboxStatus} onRetry={handleRefresh} retrying={syncing} /> : null}
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {/* Conversations */}
            <section
              aria-label={t("conversations")}
              id="inbox-conversations"
              className={cn(
                "min-h-0 shrink-0 flex-col border-r border-hairline bg-card lg:w-[340px] xl:w-[360px]",
                mobileView === "list" ? "flex w-full" : "hidden lg:flex",
              )}
            >
              <div className="shrink-0 space-y-2.5 border-b border-hairline px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <label className="relative flex min-w-0 flex-1 items-center">
                    <span className="sr-only">{t("searchConversations")}</span>
                    <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-soft-ink" />
                    <input
                      ref={searchRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          if (query) setQuery("");
                          else event.currentTarget.blur();
                        } else if (event.key === "ArrowDown" && searched[0]) {
                          event.preventDefault();
                          selectThread(searched.find((item) => item.id === effectiveId) ?? searched[0], { replace: true });
                          event.currentTarget.blur();
                        }
                      }}
                      placeholder={t("searchConversations")}
                      aria-keyshortcuts="/"
                      className="h-9 w-full rounded-full border border-transparent bg-card-inset pl-9 pr-9 text-base outline-none md:text-sm transition-[border-color,background-color] placeholder:text-quiet-mist hover:bg-row-wash focus:border-near-ink focus:bg-pure-snow [&::-webkit-search-cancel-button]:hidden dark:focus:bg-card"
                    />
                    {query ? null : <Kbd className="pointer-events-none absolute right-2.5 hidden h-5 min-w-5 text-[11px] lg:inline-flex">/</Kbd>}
                    {query ? (
                      <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} className="absolute right-2 flex size-6 items-center justify-center rounded-full text-soft-ink hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink" aria-label={t("clearSearch")}>
                        <span aria-hidden="true" className="text-base leading-none">×</span>
                      </button>
                    ) : null}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 active:scale-[0.97] motion-reduce:active:scale-100"
                    onClick={handleRefresh}
                    disabled={syncing}
                    aria-label={t("checkForMessages")}
                    title={lastSyncedLabel ? t("checkForMessagesSynced", { time: lastSyncedLabel }) : t("checkForMessages")}
                  >
                    <ArrowsClockwiseIcon className={cn("size-4", syncing && "animate-spin motion-reduce:animate-none")} />
                  </Button>
                  {candidates.length && mailboxStatus.canReply ? (
                    <Button type="button" size="icon-sm" className="shrink-0 active:scale-[0.97] motion-reduce:active:scale-100" onClick={() => setNewThread("pick")} aria-label={t("newEmail")} title={t("newEmail")}>
                      <PlusIcon className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <FilterTabs filter={filter} activeCount={searched.length} hasMore={hasMore} unreadTotal={unreadTotal} onChange={handleFilterChange} />
              </div>

              <InboxConversationList
                threads={searched}
                selectedId={effectiveId}
                unreadFor={isUnread}
                filterLabel={listLabel}
                query={query}
                loading={navPending}
                onSelect={(item) => selectThread(item)}
                onClearSearch={() => { setQuery(""); searchRef.current?.focus(); }}
                onClearFilter={filter !== "all" ? () => handleFilterChange("all") : undefined}
                footer={
                  hasMore ? (
                    <div className="flex justify-center px-3 py-3">
                      <button
                        type="button"
                        disabled={navPending}
                        className="rounded-full bg-soft-kraft px-4 py-1.5 text-[13px] font-medium transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-60"
                        onClick={() => startNav(() => router.push(inboxUrl((params) => params.set("page", String((page ?? 0) + 1))), { scroll: false }))}
                      >
                        {navPending ? t("loading") : t("loadMore")}
                      </button>
                    </div>
                  ) : null
                }
              />
            </section>

            {/* Reader */}
            <div className={cn("min-h-0 min-w-0 flex-1 bg-card", mobileView === "thread" ? "block" : "hidden lg:block")}>
              {thread ? (
                <InboxThreadReader
                  key={thread.id}
                  thread={thread}
                  messages={threadMessages}
                  messagesReady={messagesReady}
                  unread={isUnread(thread)}
                  isPending={pending}
                  canReply={mailboxStatus.canReply}
                  hideSendingNotice={demoMode}
                  composerOpen={composerThreadId === thread.id}
                  templates={composerTemplates}
                  onComposerOpenChange={(open) => setComposerThreadId(open ? thread.id : null)}
                  suggestedReply={suggestedReply?.threadId === thread.id ? suggestedReply.body : null}
                  onBack={() => setMobileView("list")}
                  onMarkRead={(target) => markRead(target)}
                  onToggleArchive={toggleArchive}
                  onOpenContext={() => setContextOpen(true)}
                  onSendReply={(payload) =>
                    replyMailboxThreadAction({
                      threadId: thread.id,
                      body: payload.body,
                      html: payload.html,
                      subject: payload.subject,
                      idempotencyKey: payload.idempotencyKey,
                      attachments: payload.attachments.map((file) => ({ filename: file.filename, contentType: file.contentType, base64: file.base64 })),
                    }).then((result) => {
                      if (result.ok) {
                        const message = result.sentCopySaved === false ? t("replySentCopyNotSaved") : t("replySent");
                        setAnnouncement(message);
                        if (result.sentCopySaved === false) toast.warning(message);
                        else toast.success(t("replySentToast"));
                        router.refresh();
                      }
                      return result;
                    })
                  }
                />
              ) : (
                <ReaderPlaceholder />
              )}
            </div>

            {/* Context: a third pane on wide screens, a sheet below that. */}
            <aside className="hidden min-h-0 w-[300px] shrink-0 border-l border-hairline bg-card-inset/50 xl:block" aria-label={t("candidateDetails")}>
              {actionsPanel}
            </aside>
          </div>
        </>
      )}

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-sm xl:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("conversationDetails")}</SheetTitle>
            <SheetDescription>{t("conversationDetailsDescription")}</SheetDescription>
          </SheetHeader>
          {contextOpen ? actionsPanel : null}
        </SheetContent>
      </Sheet>

      <InboxNewThreadSheet
        person={newThread === "person" ? contextPerson : undefined}
        candidates={candidates}
        templates={newThreadTemplates}
        open={newThread !== "closed"}
        onOpenChange={(open) => { if (!open) setNewThread("closed"); }}
        onSent={handleNewThreadSent}
      />
    </div>
  );
}
