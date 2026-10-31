"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EnvelopeSimpleDuotoneIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

export type InboxPerson = {
  key: string;
  candidateId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  threadCount: number;
  unreadCount: number;
  lastMessageAt: string;
};

export function InboxPeopleList({
  people,
  selectedKey,
  query,
  onSelect,
}: {
  people: InboxPerson[];
  selectedKey?: string;
  query: string;
  onSelect: (person: InboxPerson) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Candidates and senders">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="type-col-head uppercase">People</span>
        <span className="text-[11px] tabular-nums text-quiet-mist">{people.length}</span>
      </div>

      {people.length ? (
        <ul role="list" className="min-h-0 flex-1 overflow-y-auto">
          {people.map((person) => {
            const selected = person.key === selectedKey;
            const unread = person.unreadCount > 0;
            return (
              <li key={person.key} className="px-2 py-0.5">
                <button
                  type="button"
                  onClick={() => onSelect(person)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                    selected ? "bg-row-wash" : "hover:bg-row-wash/60",
                  )}
                >
                                    <span className="relative shrink-0">
                    <UserAvatar name={person.name} src={person.avatarUrl} size="sm" />
                    {unread ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-card bg-chartreuse-signal" aria-label={`${person.unreadCount} unread`} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("min-w-0 truncate text-[13px]", unread ? "font-semibold text-near-ink" : "font-medium text-near-ink/85")}>{person.name}</span>
                      <time className="shrink-0 font-mono text-[10px] tabular-nums text-quiet-mist" dateTime={person.lastMessageAt}>
                        <RelativeTime value={person.lastMessageAt} />
                      </time>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-soft-ink">
                      <span className="truncate">{person.email ?? "No email address"}</span>
                      {person.threadCount > 1 ? <span className="shrink-0 tabular-nums">{person.threadCount} threads</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 items-center p-4">
          <EmptyState
            title={query ? "No matching people" : "No people yet"}
            description={query ? "Try a different candidate, subject, or message." : "People who write to Harly will appear here."}
            icon={EnvelopeSimpleDuotoneIcon}
            className="min-h-0 w-full border-0 bg-transparent py-10"
          />
        </div>
      )}
    </section>
  );
}
