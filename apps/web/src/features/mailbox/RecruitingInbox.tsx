"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/lib/date-hydration";
import { InboxThreadList, matchesInboxFilter } from "@/features/mailbox/InboxThreadList";
import { InboxThreadReader } from "@/features/mailbox/InboxThreadReader";
import { InboxActionsPanel } from "@/features/mailbox/InboxActionsPanel";
import type { InboxFilter, InboxMessage, InboxThread, InboxMailboxStatus, InboxMember, InboxCandidate, InboxApplication } from "@/features/mailbox/data";
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

function derivePreview(body: string | undefined) {
  if (!body) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 96 ? `${flat.slice(0, 96)}…` : flat;
}

function SyncStatus({ status, syncing, onRetry }: { status: InboxMailboxStatus; syncing: boolean; onRetry: () => void }) {
  const [now] = useState(() => Date.now());
  const lastHealthyAt = status.lastHealthyAt ?? status.lastSyncedAt;
  const stale = lastHealthyAt ? now - new Date(lastHealthyAt).getTime() > 6 * 60 * 60_000 : false;
  const tone = status.lastError || stale || !status.lastSyncedAt || !status.enabled ? "border-amber-500/30 bg-amber-500/5" : "border-border/80 bg-muted/20";
  return <div className={cn("flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tone)} role="status">
    <div className="flex min-w-0 items-start gap-2.5"><div className="mt-0.5 shrink-0">{syncing ? <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : status.lastError || stale || !status.lastSyncedAt || !status.enabled ? <AlertCircle className="size-4 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />}</div><div className="min-w-0"><p className="font-medium">{!status.configured ? "Mailbox not connected" : !status.enabled ? "Mailbox is disabled" : syncing ? "Syncing mailbox…" : status.lastError ? "Last sync failed" : !status.lastSyncedAt ? "Mailbox has not synced yet" : stale ? "Mailbox sync is overdue" : "Mailbox is healthy"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{status.lastError ?? (status.lastSyncedAt ? <>Last checked <RelativeTime value={status.lastSyncedAt} /></> : "Connect or sync the shared mailbox to receive new messages.")}</p></div></div>
    <div className="flex shrink-0 items-center gap-3">{!status.configured || !status.enabled ? <a className="text-xs font-medium underline underline-offset-4" href="/settings/email">Open mailbox settings</a> : null}<Button type="button" size="sm" variant="outline" disabled={syncing || !status.configured || !status.enabled} onClick={onRetry}><RefreshCw className="size-4" /> Retry sync</Button></div>
  </div>;
}

export function RecruitingInbox({
  threads,
  messages,
  initialFilter,
  page = 0,
  hasMore = false,
  members,
  candidates,
  applications,
  mailboxStatus,
}: {
  threads: InboxThread[];
  messages: Record<string, InboxMessage[]>;
  initialFilter?: InboxFilter;
  page?: number;
  hasMore?: boolean;
  members: InboxMember[];
  candidates: InboxCandidate[];
  applications: InboxApplication[];
  mailboxStatus: InboxMailboxStatus;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter ?? "all");
  const [selectedId, setSelectedId] = useState(threads[0]?.id);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [announcement, setAnnouncement] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState<{ threadId: string; body: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const previews = useMemo(() => Object.fromEntries(threads.map((item) => [item.id, derivePreview(messages[item.id]?.[0]?.body)])), [threads, messages]);
  const visible = threads.filter((item) => matchesInboxFilter(item, filter));
  const thread = threads.find((item) => item.id === selectedId) ?? visible[0];
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

  function handleSelect(target: InboxThread) {
    setSelectedId(target.id);
    setMobileView("thread");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", target.id);
    router.push(`/dashboard/inbox?${params.toString()}`);
    if (target.unreadCount) handleMarkRead(target);
  }

  async function retrySync() {
    setSyncing(true);
    const result = await retryMailboxSyncAction().catch(() => ({ ok: false as const, error: "You do not have permission to retry mailbox synchronization." }));
    setAnnouncement(result.ok ? `Sync complete. Imported ${"imported" in result ? result.imported : 0} messages; skipped ${"skipped" in result ? result.skipped : 0} duplicates.` : result.error ?? "Sync failed.");
    setSyncing(false);
    router.refresh();
  }

  const actionsPanel = thread ? <InboxActionsPanel
    thread={thread}
    members={members}
    candidates={candidates}
    applications={applications}
    isPending={pending}
    onAssign={(ownerId) => runAction(() => updateMailboxThreadAction({ threadId: thread.id, ownerId }), ownerId ? "Thread assigned." : "Thread unassigned.")}
    onCandidateChange={(candidateId) => runAction(() => linkMailboxThreadToCandidateAction({ threadId: thread.id, candidateId }), candidateId ? "Candidate linked." : "Candidate unlinked.")}
    onApplicationChange={(applicationId) => runAction(() => linkMailboxThreadToApplicationAction({ threadId: thread.id, applicationId: applicationId ?? null }), applicationId ? "Application linked." : "Application unlinked.")}
    onCreateCandidate={() => { startTransition(() => { void runAction(() => createCandidateFromMailboxThreadAction({ threadId: thread.id }), "Candidate created from this thread."); }); }}
    onArchive={() => { startTransition(() => { void runAction(() => updateMailboxThreadAction({ threadId: thread.id, status: "archived" }), "Thread archived."); }); }}
    onMarkSpam={() => { startTransition(() => { void runAction(() => updateMailboxThreadAction({ threadId: thread.id, status: "spam" }), "Thread marked as spam."); }); }}
    onSummarize={() => summarizeMailboxThreadAction({ threadId: thread.id })}
    onSuggestReply={() => suggestMailboxReplyAction({ threadId: thread.id }).then((result) => { if (result.ok && result.draft) setSuggestedReply({ threadId: thread.id, body: result.draft.body }); return result; })}
  /> : null;

  return <div className="space-y-4"><div aria-live="polite" className="sr-only">{announcement}</div><SyncStatus status={mailboxStatus} syncing={syncing} onRetry={() => void retrySync()} />{!threads.length ? <EmptyState title="No messages yet" description="Connect a shared IMAP mailbox in Settings → Email. New mail will appear here as unassigned until your team links it." icon={EnvelopeIcon} action={{ href: "/settings/email", label: "Connect a mailbox" }} /> : <><div className="relative h-[calc(100vh-18rem)] min-h-[560px] overflow-hidden rounded-xl border bg-card lg:grid lg:grid-cols-[300px_minmax(0,1fr)_280px]"><div className={cn("flex h-full w-[200%] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none lg:contents", mobileView === "thread" ? "-translate-x-1/2" : "translate-x-0")}><div className="w-1/2 shrink-0 border-r border-border/80 lg:w-auto lg:shrink"><InboxThreadList threads={threads} previews={previews} filter={filter} selectedId={thread?.id} onFilterChange={(nextFilter) => { setFilter(nextFilter); router.push(`/dashboard/inbox?filter=${nextFilter}`); }} onSelect={handleSelect} /></div><div className="w-1/2 shrink-0 lg:w-auto lg:shrink lg:border-r lg:border-border/80">{thread ? <InboxThreadReader key={`${thread.id}-${suggestedReply?.threadId === thread.id ? suggestedReply.body : ""}`} thread={thread} messages={threadMessages} isPending={pending} suggestedReply={suggestedReply?.threadId === thread.id ? suggestedReply.body : null} onBack={() => setMobileView("list")} onMarkRead={handleMarkRead} onReply={(body) => replyMailboxThreadAction({ threadId: thread.id, body }).then((result) => { if (result.ok) setAnnouncement(result.sentCopySaved === false ? "Reply sent, but Sent copy failed." : "Reply sent."); return result; })} actionsSlot={actionsPanel} /> : <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Select a message to read it here.</div>}</div></div><div className="hidden lg:block">{actionsPanel}</div></div>{hasMore ? <div className="flex justify-center"><button type="button" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent" onClick={() => { const params = new URLSearchParams(window.location.search); params.set("page", String((page ?? 0) + 1)); params.delete("thread"); router.push(`/dashboard/inbox?${params.toString()}`); }}>Load more threads</button></div> : null}</>}</div>;
}
