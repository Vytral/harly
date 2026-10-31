"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EnvelopeSimpleDuotoneIcon } from "@/components/ui/icons/phosphor";
import { PlusIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

import type { InboxPerson } from "@/features/mailbox/InboxPeopleList";
import type { InboxThread } from "@/features/mailbox/data";

export function InboxConversationList({
  person,
  threads,
  selectedId,
  query,
  onSelect,
  onNewThread,
}: {
  person?: InboxPerson;
  threads: InboxThread[];
  selectedId?: string;
  query: string;
  onSelect: (thread: InboxThread) => void;
  onNewThread?: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={person ? `Conversations with ${person.name}` : "Conversations"}>
      <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3">
        {person ? <UserAvatar name={person.name} src={person.avatarUrl} size="sm" /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{person?.name ?? "Select a person"}</h2>
          <p className="truncate text-xs text-soft-ink">
            {person ? `${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}` : "Choose someone from the list"}
          </p>
        </div>
        {person?.email && onNewThread ? (
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={onNewThread} aria-label="New thread" title="New thread">
            <PlusIcon className="size-4" />
          </Button>
        ) : null}
      </div>

      {threads.length ? (
        <ul role="list" className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((thread) => {
            const selected = thread.id === selectedId;
            const unread = thread.unreadCount > 0;
            return (
              <li key={thread.id} className="px-2 py-0.5">
                <button
                  type="button"
                  onClick={() => onSelect(thread)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                    selected ? "bg-row-wash" : "hover:bg-row-wash/60",
                  )}
                >
                                    <span className="relative mt-0.5 shrink-0">
                    <span className="flex size-8 items-center justify-center rounded-full bg-card-inset text-[12px] font-semibold text-soft-ink">
                      {thread.subject.trim().charAt(0).toUpperCase() || "·"}
                    </span>
                    {unread ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-card bg-chartreuse-signal" aria-label={`${thread.unreadCount} unread`} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("min-w-0 truncate text-[13px]", unread ? "font-semibold text-near-ink" : "font-medium text-near-ink/85")}>{thread.subject}</span>
                      <time className="shrink-0 font-mono text-[10px] tabular-nums text-quiet-mist" dateTime={thread.lastMessageAt}>
                        <RelativeTime value={thread.lastMessageAt} />
                      </time>
                    </span>
                    <span className="mt-1 block truncate text-xs leading-5 text-soft-ink">{thread.preview || "No message preview."}</span>
                    {thread.needsReply ? <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-lime-wash px-2 py-0.5 text-[10.5px] font-medium text-success-olive"><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />Needs reply</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 items-center p-5">
          <EmptyState
            title={query ? "No matching conversations" : "No conversations"}
            description={query ? "Try a different subject or message." : "This person has no conversations in the current view."}
            icon={EnvelopeSimpleDuotoneIcon}
            className="min-h-0 w-full border-0 bg-transparent py-10"
          />
        </div>
      )}
    </section>
  );
}
