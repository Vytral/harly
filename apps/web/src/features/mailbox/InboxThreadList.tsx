"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EnvelopeSimpleDuotoneIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

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

export function matchesInboxFilter(thread: InboxThread, filter: InboxFilter) {
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
      return Boolean(thread.ownerId);
    case "archived":
      return thread.status === "archived";
  }
}

export function InboxThreadList({
  threads,
  previews,
  query,
  filterLabel,
  selectedId,
  onSelect,
}: {
  threads: InboxThread[];
  previews: Record<string, string | null>;
  query: string;
  filterLabel: string;
  selectedId: string | undefined;
  onSelect: (thread: InboxThread) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Inbox conversations">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{filterLabel}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
          {threads.length} {threads.length === 1 ? "thread" : "threads"}
        </span>
      </div>

      {threads.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center p-4">
          <EmptyState
            title={query ? "No matching conversations" : "No messages here"}
            description={query ? "Try a different sender, subject, or keyword." : "Nothing matches this filter right now."}
            icon={EnvelopeSimpleDuotoneIcon}
            className="min-h-0 w-full border-0 bg-transparent py-10"
          />
        </div>
      ) : (
        <ul role="list" className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
          {threads.map((item) => {
            const isSelected = selectedId === item.id;
            const isUnread = item.unreadCount > 0;
            const senderName = item.candidateName ?? item.participantEmail ?? "Unknown sender";
            const preview = previews[item.id] || "No preview available.";
            return (
              <li key={item.id} data-thread-row={item.id} className="relative">
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "group relative flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors duration-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                    isSelected ? "bg-accent/60" : "hover:bg-muted/50",
                  )}
                >
                  {isSelected ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-primary" aria-hidden="true" /> : null}
                  <span className="relative mt-0.5 shrink-0">
                    <UserAvatar name={senderName} src={item.candidateAvatarUrl} size="sm" />
                    {isUnread ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-card bg-primary" aria-label={`${item.unreadCount} unread`} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("min-w-0 truncate text-[13px]", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
                        {senderName}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                        <RelativeTime value={item.lastMessageAt} />
                      </span>
                    </span>
                    <span className={cn("mt-0.5 block truncate text-[13px]", isUnread ? "font-medium text-foreground/90" : "text-foreground/70")}>
                      {item.subject}
                    </span>
                    <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">{preview}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
