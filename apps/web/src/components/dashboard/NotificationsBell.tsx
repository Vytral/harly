"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CheckCheck, Eye, EyeOff, Trash2 } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  deleteNotification,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/data";
import { NotificationTypeIconSmall } from "@/features/notifications/notification-icons";
import { ActorAvatar } from "@/features/notifications/actor-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  function toggleRead(e: React.MouseEvent, item: NotificationItem) {
    e.stopPropagation();
    startTransition(async () => {
      if (item.read) {
        await markNotificationUnread({ notificationId: item.id });
      } else {
        await markNotificationRead({ notificationId: item.id });
      }
      router.refresh();
    });
  }

  function dismiss(e: React.MouseEvent, item: NotificationItem) {
    e.stopPropagation();
    startTransition(async () => {
      await deleteNotification({ notificationId: item.id });
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
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
            You&apos;re all caught up. No notifications yet.
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
                  "group flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  index > 0 && "border-t border-border/60",
                  !item.read && "bg-primary/[0.03]",
                )}
              >
                <span className="relative mt-0.5">
                  <NotificationTypeIconSmall type={item.type} />
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
                  <span
                    className={cn(
                      "block truncate text-[13px]",
                      item.read ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.body ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <RelativeTime value={item.createdAt} />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {!item.read ? (
                    <span className="size-1.5 rounded-full bg-primary" />
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                          <circle cx="5" cy="12" r="1" />
                        </svg>
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => toggleRead(e, item)}
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
                        onClick={(e) => dismiss(e, item)}
                        disabled={isPending}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </button>
            ))}
          </div>
        )}

      </PopoverContent>
    </Popover>
  );
}
