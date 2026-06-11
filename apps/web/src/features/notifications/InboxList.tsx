"use client";

import { useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { AtSign, Bell, CheckCheck } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/data";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

function NotificationIcon({ type }: { type: string }) {
  const Icon = type === "note.mentioned" ? AtSign : Bell;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-4.5" strokeWidth={1.8} />
    </span>
  );
}

export function InboxList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.read).length;

  function open(item: NotificationItem) {
    startTransition(async () => {
      if (!item.read) {
        await markNotificationRead({ notificationId: item.id });
      }
      if (item.href) {
        router.push(item.href as Route);
      } else {
        router.refresh();
      }
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Bell className="size-5" strokeWidth={1.6} />
        </span>
        <p className="text-sm font-medium">You&apos;re all caught up</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Mentions and updates from your team will land here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unread === 0
            ? "All caught up."
            : `${unread} unread notification${unread === 1 ? "" : "s"}.`}
        </p>
        {unread > 0 ? (
          <Button size="sm" variant="outline" onClick={markAll} disabled={isPending}>
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => open(item)}
            disabled={isPending}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
              index > 0 && "border-t border-border/70",
              !item.read && "bg-primary/[0.03]",
            )}
          >
            <NotificationIcon type={item.type} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-sm",
                    item.read ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {item.title}
                </span>
                {!item.read ? (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                ) : null}
              </span>
              {item.body ? (
                <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                  {item.body}
                </span>
              ) : null}
              <span className="mt-1 block text-xs text-muted-foreground">
                <RelativeTime value={item.createdAt} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
