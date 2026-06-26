"use client";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

export function InboxList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const unread = items.filter((item) => !item.read).length;

  const visible = filter === "unread" ? items.filter((i) => !i.read) : items;

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

  function toggleRead(item: NotificationItem) {
    startTransition(async () => {
      if (item.read) {
        await markNotificationUnread({ notificationId: item.id });
      } else {
        await markNotificationRead({ notificationId: item.id });
      }
      router.refresh();
    });
  }

  function remove(item: NotificationItem) {
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
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
        <p className="max-w-sm text-sm text-muted-foreground">
          Mentions and updates from your team will land here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread{unread > 0 ? ` (${unread})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium">No unread notifications</p>
          <p className="text-sm text-muted-foreground">
            Switch to &ldquo;All&rdquo; to see past notifications.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {visible.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "group flex w-full items-start gap-3 px-4 py-3.5 transition-colors",
                index > 0 && "border-t border-border/70",
                !item.read && "bg-primary/[0.03]",
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
                        item.read
                          ? "text-muted-foreground"
                          : "font-medium",
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
                    {item.actorName ? (
                      <span className="font-medium text-foreground/70">
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
