"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { CheckCheck, MailOpen, Paperclip, Reply } from "lucide-react";

import {
  markAllInboundRepliesRead,
  markInboundReplyRead,
} from "@/features/inbound-email/actions";
import type { InboundReplyItem } from "@/features/inbound-email/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

export function InboundReplyList({ items }: { items: InboundReplyItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [isPending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.read).length;
  const visible =
    filter === "unread" ? items.filter((item) => !item.read) : items;

  function markRead(messageId: string) {
    startTransition(async () => {
      await markInboundReplyRead({ messageId });
    });
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllInboundRepliesRead();
    });
  }

  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Reply className="size-5" />
          </span>
          <p className="text-sm font-medium">No candidate replies yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Replies sent to your configured inbound address will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border bg-card p-1"
          role="tablist"
          aria-label="Reply filter"
        >
          {(["all", "unread"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "secondary" : "ghost"}
              onClick={() => setFilter(value)}
              role="tab"
              aria-selected={filter === value}
            >
              {value === "all"
                ? "All replies"
                : `Unread${unread ? ` (${unread})` : ""}`}
            </Button>
          ))}
        </div>
        {unread > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={markAllRead}
            disabled={isPending}
          >
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="filtered"
          icon={CheckCheck}
          title="No unread replies"
          hint="You're caught up. Switch off the unread filter to see the whole history."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {visible.map((item, index) => (
            <article
              key={item.id}
              className={cn(
                "group flex gap-3 px-4 py-4 transition-colors hover:bg-muted/30",
                index > 0 && "border-t border-border/70",
                !item.read && "bg-sky-500/[0.035]",
              )}
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <MailOpen className="size-[18px]" />
              </span>
              <Link
                href={`/dashboard/candidates/${item.candidateId}` as Route}
                onClick={() => !item.read && markRead(item.id)}
                className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={cn("text-sm", !item.read && "font-semibold")}>
                    {item.candidateName}
                  </p>
                  {item.jobTitle ? (
                    <Badge variant="secondary">{item.jobTitle}</Badge>
                  ) : null}
                  {!item.read ? (
                    <span
                      className="size-1.5 rounded-full bg-sky-500"
                      aria-label="Unread"
                    />
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 truncate text-sm",
                    !item.read ? "font-medium" : "text-muted-foreground",
                  )}
                >
                  {item.subject || "(No subject)"}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.body || "No plain-text preview was included."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{item.fromEmail ?? item.candidateEmail}</span>
                  <span aria-hidden="true">·</span>
                  <RelativeTime value={item.createdAt} />
                  {item.attachments.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3" />
                      {item.attachments.length}
                    </span>
                  ) : null}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
