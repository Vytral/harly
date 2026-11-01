"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  EllipsisVertical,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  deleteNotification,
  deleteAllNotifications,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/data";
import { NotificationTypeIcon } from "@/features/notifications/notification-icons";
import { ActorAvatar } from "@/features/notifications/actor-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

export function InboxList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const unread = items.filter((item) => !item.read).length;

  const visible = filter === "unread" ? items.filter((i) => !i.read) : items;

  function open(item: NotificationItem) {
    setError(null);
    startTransition(async () => {
      if (!item.read) {
        try {
          const result = await markNotificationRead({
            notificationId: item.id,
          });
          if (!result.success)
            setError("Could not mark the notification as read.");
        } catch {
          setError("Could not mark the notification as read.");
        }
      }
      if (item.href) {
        router.push(item.href as Route);
      } else {
        router.refresh();
      }
    });
  }

  function toggleRead(item: NotificationItem) {
    setError(null);
    startTransition(async () => {
      try {
        const result = item.read
          ? await markNotificationUnread({ notificationId: item.id })
          : await markNotificationRead({ notificationId: item.id });
        if (!result.success) {
          setError("Could not update the notification.");
          return;
        }
      } catch {
        setError("Could not update the notification.");
        return;
      }
      router.refresh();
    });
  }

  function remove(item: NotificationItem) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteNotification({ notificationId: item.id });
        if (!result.success) {
          setError("Could not delete the notification.");
          return;
        }
      } catch {
        setError("Could not delete the notification.");
        return;
      }
      router.refresh();
    });
  }

  function markAll() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markAllNotificationsRead();
        if (!result.success) {
          setError("Could not mark all notifications as read.");
          return;
        }
      } catch {
        setError("Could not mark all notifications as read.");
        return;
      }
      router.refresh();
    });
  }

  async function removeAll() {
    if (
      !(await confirm({
        tone: "destructive",
        title: "Delete all notifications?",
        description: "Your whole inbox is cleared. This cannot be undone.",
        confirmLabel: "Delete all",
      }))
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAllNotifications();
        if (!result.success) {
          setError("Could not delete all notifications.");
          return;
        }
      } catch {
        setError("Could not delete all notifications.");
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-card px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <span className="flex size-10 items-center justify-center rounded-[var(--radius-inner)] bg-card-inset text-soft-ink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </span>
        <p className="text-sm font-medium">You&apos;re all caught up</p>
        <p className="max-w-sm text-sm text-soft-ink">
          Mentions and updates from your team will land here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter notifications" className="flex items-center gap-1.5">
          {(
            [
              ["all", "All", items.length],
              ["unread", "Unread", unread],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                filter === value
                  ? "bg-near-ink text-pure-snow"
                  : "bg-soft-kraft text-soft-ink hover:bg-row-wash hover:text-near-ink",
              )}
            >
              {label}
              {count > 0 ? <span className="tabular-nums opacity-70">{count}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={markAll}
              disabled={isPending}
            >
              <CheckCheck className="size-4" />
              Mark all as read
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={removeAll}
            disabled={isPending}
          >
            <Trash2 className="size-4" />
            Delete all
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-card px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium">No unread notifications</p>
          <p className="text-sm text-soft-ink">
            Switch to &ldquo;All&rdquo; to see past notifications.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] bg-card p-2 shadow-[var(--shadow-card)]">
          {visible.map((item) => (
            <div
              key={item.id}
              className={cn(
                "group flex w-full items-start gap-3 rounded-[var(--radius-inner)] px-3 py-3 transition-colors hover:bg-row-wash/60",
                !item.read && "bg-lime-wash/50",
              )}
            >
              <button
                type="button"
                onClick={() => open(item)}
                disabled={isPending}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span className="relative shrink-0">
                  <NotificationTypeIcon type={item.type} />
                  {item.actorAvatar ? (
                    <span className="absolute -bottom-1 -right-1">
                      <ActorAvatar
                        name={item.actorName}
                        avatar={item.actorAvatar}
                        size="sm"
                      />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        item.read ? "text-soft-ink" : "font-medium text-near-ink",
                      )}
                    >
                      {item.title}
                    </span>
                    {!item.read ? (
                      <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-chartreuse-signal ring-1 ring-success-olive/30" />
                    ) : null}
                  </span>
                  {item.body ? (
                    <span className="mt-0.5 line-clamp-2 block text-sm text-soft-ink">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-soft-ink">
                    {item.actorName ? (
                      <span className="font-medium text-near-ink/70">
                        {item.actorName}
                      </span>
                    ) : null}
                    {item.actorName ? " · " : null}
                    <RelativeTime value={item.createdAt} />
                  </span>
                </span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                  >
                    <EllipsisVertical className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => toggleRead(item)}
                    disabled={isPending}
                  >
                    {item.read ? (
                      <>
                        <EyeOff className="size-4" />
                        Mark as unread
                      </>
                    ) : (
                      <>
                        <Eye className="size-4" />
                        Mark as read
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => remove(item)}
                    disabled={isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
