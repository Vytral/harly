"use client";

import { Mail } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

import type { InboxThread } from "@/features/mailbox/data";

import type { InboxFilter } from "@/features/mailbox/data";

export const inboxFilters: ReadonlyArray<[InboxFilter, string]> = [
  ["all", "All"],
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
    case "archived":
      return thread.status === "archived";
  }
}

export function InboxThreadList({
  threads,
  previews,
  filter,
  selectedId,
  onFilterChange,
  onSelect,
}: {
  threads: InboxThread[];
  previews: Record<string, string | null>;
  filter: InboxFilter;
  selectedId: string | undefined;
  onFilterChange: (filter: InboxFilter) => void;
  onSelect: (thread: InboxThread) => void;
}) {
  const visible = threads.filter((thread) => matchesInboxFilter(thread, filter));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label="Inbox filters"
        className="flex gap-1 overflow-x-auto border-b border-border/80 p-2"
      >
        {inboxFilters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => onFilterChange(value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-[background-color,color] active:scale-[0.98]",
              filter === value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center p-4">
          <EmptyState
            title="No messages here"
            description="Nothing matches this filter right now. Try another filter or check back after your next sync."
            icon={Mail}
            className="min-h-0 w-full py-10"
          />
        </div>
      ) : (
        <ul role="list" className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((item) => {
            const isSelected = selectedId === item.id;
            const senderName = item.candidateName ?? item.participantEmail ?? "Unknown sender";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors active:scale-[0.99]",
                    isSelected ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <UserAvatar name={senderName} size="md" className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          item.unreadCount ? "font-semibold text-foreground" : "text-foreground/90",
                        )}
                      >
                        {senderName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <RelativeTime value={item.lastMessageAt} />
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-sm",
                        item.unreadCount ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {previews[item.id] || "No preview available."}
                    </p>
                  </div>
                  {item.unreadCount ? (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
