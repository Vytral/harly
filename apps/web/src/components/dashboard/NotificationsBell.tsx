"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { AtSign, Bell, CheckCheck } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/data";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

/** Top-bar bell with unread badge and a quick peek at recent notifications. */
export function NotificationsBell({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.read).length;

  function openItem(item: NotificationItem) {
    setOpen(false);
    startTransition(async () => {
      if (!item.read) {
        await markNotificationRead({ notificationId: item.id });
      }
      if (item.href) {
        router.push(item.href as Route);
      }
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
          aria-label={
            unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
          }
        >
          <Bell className="size-[18px]" strokeWidth={1.5} />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="-mr-2 h-7 text-xs text-muted-foreground"
              onClick={markAll}
              disabled={isPending}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up — no notifications yet.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                disabled={isPending}
                className={cn(
                  "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  index > 0 && "border-t border-border/60",
                  !item.read && "bg-primary/[0.03]",
                )}
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <AtSign className="size-3.5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px]",
                      item.read ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <RelativeTime value={item.createdAt} />
                  </span>
                </span>
                {!item.read ? (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                ) : null}
              </button>
            ))}
          </div>
        )}

        <div className="border-t px-2 py-1.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground"
            onClick={() => setOpen(false)}
          >
            <Link href="/dashboard/inbox">View all in Inbox</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
