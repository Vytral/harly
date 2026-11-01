"use client";

import { useEffect, useRef } from "react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { EnvelopeSimpleDuotoneIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import { ThreadChips } from "@/features/mailbox/InboxThreadMeta";
import { threadPersonName } from "@/features/mailbox/inbox-filters";
import type { InboxThread } from "@/features/mailbox/data";

function snippet(value: string | null) {
  const flat = (value ?? "").replace(/\s+/g, " ").trim();
  return flat || "No message preview.";
}

function ThreadRow({ thread, selected, unread, onSelect }: { thread: InboxThread; selected: boolean; unread: boolean; onSelect: (thread: InboxThread) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const name = threadPersonName(thread);

  // Keep the keyboard-selected row in view (j/k can move past the fold).
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <li className="px-2 py-0.5">
      <button
        ref={ref}
        type="button"
        onClick={() => onSelect(thread)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group relative flex w-full items-start gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-near-ink/40",
          selected ? "bg-row-wash" : "hover:bg-row-wash/60",
        )}
      >
        {selected ? <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-near-ink" /> : null}
        <span className="relative mt-0.5 shrink-0">
          <UserAvatar name={name} src={thread.candidateAvatarUrl} size="md" />
          {unread ? (
            <span
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-chartreuse-signal"
              role="img"
              aria-label={`${thread.unreadCount} unread`}
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("min-w-0 truncate text-[13.5px]", unread ? "font-semibold text-near-ink" : "font-medium text-near-ink/90")}>{name}</span>
            <time className="shrink-0 text-[11px] tabular-nums text-quiet-mist" dateTime={thread.lastMessageAt}>
              <RelativeTime value={thread.lastMessageAt} />
            </time>
          </span>
          <span className={cn("mt-0.5 block truncate text-[13px]", unread ? "font-medium text-near-ink" : "text-near-ink/80")}>{thread.subject}</span>
          <span className="mt-0.5 block truncate text-xs leading-5 text-soft-ink">{snippet(thread.preview)}</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {thread.needsReply ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-wash px-2 py-0.5 text-[11px] font-medium text-success-olive">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  Needs reply
                </span>
              ) : null}
              <ThreadChips thread={thread} />
              {!thread.candidateId ? <span className="rounded-full bg-card-inset px-2 py-0.5 text-[11px] font-medium text-soft-ink">Not linked</span> : null}
            </span>
            {thread.ownerName ? (
              <span className="shrink-0" title={`Assigned to ${thread.ownerName}`}>
                <UserAvatar name={thread.ownerName} src={thread.ownerImage} size="sm" className="size-5" />
                <span className="sr-only">Assigned to {thread.ownerName}</span>
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export function InboxConversationList({
  threads,
  selectedId,
  unreadFor,
  filterLabel,
  query,
  loading = false,
  onSelect,
  onClearSearch,
  onClearFilter,
  footer,
}: {
  threads: InboxThread[];
  selectedId?: string;
  /** Unread state after optimistic "read" updates. */
  unreadFor: (thread: InboxThread) => boolean;
  filterLabel: string;
  query: string;
  loading?: boolean;
  onSelect: (thread: InboxThread) => void;
  onClearSearch: () => void;
  onClearFilter?: () => void;
  footer?: React.ReactNode;
}) {
  if (!threads.length) {
    const searching = query.trim().length > 0;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-[var(--radius-inner)] bg-card-inset text-soft-ink">
          <EnvelopeSimpleDuotoneIcon className="size-5" />
        </span>
        <h3 className="mt-4 text-sm font-semibold">{searching ? "No matching conversations" : `Nothing in ${filterLabel}`}</h3>
        <p className="mt-1.5 max-w-[16rem] text-xs leading-5 text-soft-ink">
          {searching ? "Search covers the conversations loaded in this view. Try a name, subject or phrase." : "When something lands here it will show up on its own."}
        </p>
        {searching ? (
          <button type="button" onClick={onClearSearch} className="mt-4 rounded-full bg-soft-kraft px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink">
            Clear search
          </button>
        ) : onClearFilter ? (
          <button type="button" onClick={onClearFilter} className="mt-4 rounded-full bg-soft-kraft px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink">
            Show all conversations
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 transition-opacity duration-150", loading && "opacity-60")} aria-busy={loading}>
      <ul role="list" aria-label="Conversations">
        {threads.map((thread) => (
          <ThreadRow key={thread.id} thread={thread} selected={thread.id === selectedId} unread={unreadFor(thread)} onSelect={onSelect} />
        ))}
      </ul>
      {footer}
    </div>
  );
}
