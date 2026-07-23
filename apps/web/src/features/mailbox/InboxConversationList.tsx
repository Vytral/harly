"use client";

import { EmptyState } from "@/components/ui/EmptyState";
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
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-3">
        {person ? <UserAvatar name={person.name} src={person.avatarUrl} size="sm" /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{person?.name ?? "Select a person"}</h2>
          <p className="truncate text-xs text-muted-foreground">
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
              <li key={thread.id} className="border-b border-border/45">
                <button
                  type="button"
                  onClick={() => onSelect(thread)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                    selected ? "bg-accent/60" : "hover:bg-muted/50",
                  )}
                >
                  {selected ? <span className="absolute inset-y-1.5 left-0 w-0.5 bg-primary" aria-hidden="true" /> : null}
                  <span className="relative mt-0.5 shrink-0">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {thread.subject.trim().charAt(0).toUpperCase() || "·"}
                    </span>
                    {unread ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-card bg-primary" aria-label={`${thread.unreadCount} unread`} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("min-w-0 truncate text-[13px]", unread ? "font-semibold text-foreground" : "font-medium text-foreground/85")}>{thread.subject}</span>
                      <time className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70" dateTime={thread.lastMessageAt}>
                        <RelativeTime value={thread.lastMessageAt} />
                      </time>
                    </span>
                    <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">{thread.preview || "No message preview."}</span>
                    {thread.needsReply ? <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Needs reply</span> : null}
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
