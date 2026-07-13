"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/EmptyState";
import { EnvelopeIcon } from "@/components/ui/icons/settings";
import { cn } from "@/lib/utils";

import {
  InboxThreadList,
  matchesInboxFilter,
} from "@/features/mailbox/InboxThreadList";
import { InboxThreadReader } from "@/features/mailbox/InboxThreadReader";
import { InboxActionsPanel } from "@/features/mailbox/InboxActionsPanel";
import type { InboxMessage, InboxThread, InboxFilter } from "@/features/mailbox/data";
import {
  createCandidateFromMailboxThreadAction,
  markInboxThreadReadAction,
  replyMailboxThreadAction,
  updateMailboxThreadAction,
} from "@/features/mailbox/actions";

function derivePreview(body: string | undefined) {
  if (!body) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 96 ? `${flat.slice(0, 96)}…` : flat;
}

export function RecruitingInbox({
  threads,
  messages,
  initialFilter,
  page = 0,
  hasMore = false,
}: {
  threads: InboxThread[];
  messages: Record<string, InboxMessage[]>;
  initialFilter?: InboxFilter;
  page?: number;
  hasMore?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>(initialFilter ?? "all");
  const [selectedId, setSelectedId] = useState(threads[0]?.id);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const previews = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const item of threads) {
      map[item.id] = derivePreview(messages[item.id]?.[0]?.body);
    }
    return map;
  }, [threads, messages]);

  const visible = threads.filter((item) => matchesInboxFilter(item, filter));
  const thread = threads.find((item) => item.id === selectedId) ?? visible[0];
  const threadMessages = thread ? (messages[thread.id] ?? []) : [];

  function act(fn: () => Promise<unknown>, message: string) {
    startTransition(async () => {
      await fn();
      setAnnouncement(message);
    });
  }

  function handleMarkRead(target: InboxThread) {
    act(
      () => markInboxThreadReadAction({ threadId: target.id, source: target.source }),
      `Marked "${target.subject}" as read.`,
    );
  }

  function handleSelect(target: InboxThread) {
    setSelectedId(target.id);
    setMobileView("thread");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", target.id);
    router.push(`/dashboard/inbox?${params.toString()}`);
    if (target.unreadCount) handleMarkRead(target);
  }

  if (!threads.length) {
    return (
      <div className="space-y-5">
        <EmptyState
          title="No mailbox connected yet"
          description="Connect a shared IMAP mailbox in Settings → Email. New mail will appear here as unassigned until your team links it."
          icon={EnvelopeIcon}
          action={{ href: "/settings/email", label: "Connect a mailbox" }}
        />
      </div>
    );
  }

  const actionsPanel = thread ? (
    <InboxActionsPanel
      thread={thread}
      isPending={pending}
      onCreateCandidate={() =>
        act(
          () => createCandidateFromMailboxThreadAction({ threadId: thread.id }),
          "Candidate created from this thread.",
        )
      }
      onArchive={() =>
        act(
          () => updateMailboxThreadAction({ threadId: thread.id, status: "archived" }),
          "Thread archived.",
        )
      }
      onMarkSpam={() =>
        act(
          () => updateMailboxThreadAction({ threadId: thread.id, status: "spam" }),
          "Thread marked as spam.",
        )
      }
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="relative h-[calc(100vh-15rem)] min-h-[560px] overflow-hidden rounded-xl border bg-card lg:grid lg:grid-cols-[300px_minmax(0,1fr)_260px]">
        <div
          className={cn(
            "flex h-full w-[200%] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none lg:contents",
            mobileView === "thread" ? "-translate-x-1/2" : "translate-x-0",
          )}
        >
          <div className="w-1/2 shrink-0 border-r border-border/80 lg:w-auto lg:shrink">
            <InboxThreadList
              threads={threads}
              previews={previews}
              filter={filter}
              selectedId={thread?.id}
              onFilterChange={(nextFilter) => {
                setFilter(nextFilter);
                router.push(`/dashboard/inbox?filter=${nextFilter}`);
              }}
              onSelect={handleSelect}
            />
          </div>

          <div className="w-1/2 shrink-0 lg:w-auto lg:shrink lg:border-r lg:border-border/80">
            {thread ? (
              <InboxThreadReader
                thread={thread}
                messages={threadMessages}
                isPending={pending}
                onBack={() => setMobileView("list")}
                onMarkRead={handleMarkRead}
                onReply={async (body) => {
                  const result = await replyMailboxThreadAction({ threadId: thread.id, body });
                  if (result.ok) setAnnouncement("Reply sent.");
                  return result;
                }}
                actionsSlot={actionsPanel}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Select a message to read it here.
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:block">{actionsPanel}</div>
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.set("page", String((page ?? 0) + 1));
              params.delete("thread");
              router.push(`/dashboard/inbox?${params.toString()}`);
            }}
          >
            Load more threads
          </button>
        </div>
      ) : null}
    </div>
  );
}
