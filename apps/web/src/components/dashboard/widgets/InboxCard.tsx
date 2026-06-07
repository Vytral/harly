"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Inbox,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxItem } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint, dueVariant } from "./primitives";

const VISIBLE_COUNT = 3;

const iconMap: Record<InboxItem["icon"], LucideIcon> = {
  feedback: MessageSquare,
  schedule: CalendarPlus,
  screen: FileText,
  approve: CheckCircle2,
};

export function InboxCard({
  items,
  className,
}: {
  items: InboxItem[];
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, VISIBLE_COUNT);
  const hiddenCount = items.length - VISIBLE_COUNT;

  return (
    <Tile className={className}>
      <TileHeader
        icon={Inbox}
        title="Your inbox"
        count={items.length}
        action={<TileLink href="/dashboard/inbox">View all</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-2 pt-1">
        {items.length > 0 ? (
          <>
            <ul className="divide-y divide-border/60">
              {visible.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href as Route}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted/60"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" strokeWidth={1.8} />
                      </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.title}>{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground" title={item.subtitle}>{item.subtitle}</p>
                    </div>
                      <Badge variant={dueVariant[item.dueState]} className="shrink-0">
                        {item.due}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {!showAll && hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={cn(
                  "mx-3 mt-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5",
                  "text-xs font-medium text-muted-foreground transition hover:bg-muted/60",
                )}
              >
                <ChevronDown className="size-3.5" strokeWidth={1.8} />
                {hiddenCount} more item{hiddenCount !== 1 ? "s" : ""}
              </button>
            ) : showAll && hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className={cn(
                  "mx-3 mt-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5",
                  "text-xs font-medium text-muted-foreground transition hover:bg-muted/60",
                )}
              >
                <ChevronUp className="size-3.5" strokeWidth={1.8} />
                Show less
              </button>
            ) : null}
          </>
        ) : (
          <EmptyHint
            icon={Inbox}
            text="You're all caught up. New requests will appear here."
          />
        )}
      </div>
    </Tile>
  );
}
