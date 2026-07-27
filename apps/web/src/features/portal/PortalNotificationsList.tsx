"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Route } from "next";

import type { CandidatePortalNotificationItem } from "@/features/portal/notification-data";
import {
  deleteAllCandidatePortalNotifications,
  deleteCandidatePortalNotification,
  markAllCandidatePortalNotificationsRead,
  markCandidatePortalNotificationRead,
  markCandidatePortalNotificationUnread,
} from "@/features/portal/notification-actions";
import { formatRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  CalendarIcon,
  TrashIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";

const ICON_MAP = {
  interview_scheduled: CalendarIcon,
  interview_rescheduled: CalendarIcon,
  interview_completed: CheckCircleIcon,
  application_rejected: XCircleIcon,
  application_hired: CheckCircleIcon,
} as const;

const ICON_COLOR_MAP = {
  interview_scheduled: "text-blue-500",
  interview_rescheduled: "text-blue-500",
  interview_completed: "text-emerald-500",
  application_rejected: "text-muted-foreground",
  application_hired: "text-emerald-500",
} as const;

function NotificationIcon({ type }: { type: string }) {
  const Icon = ICON_MAP[type as keyof typeof ICON_MAP] ?? CalendarIcon;
  const color = ICON_COLOR_MAP[type as keyof typeof ICON_COLOR_MAP] ?? "text-muted-foreground";
  return <Icon className={cn("size-5", color)} />;
}

export function PortalNotificationsList({
  notifications,
}: {
  notifications: CandidatePortalNotificationItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unreadCount = notifications.filter((item) => !item.read).length;

  function markRead(notificationId: string, read: boolean) {
    startTransition(async () => {
      await (read
        ? markCandidatePortalNotificationRead({ notificationId })
        : markCandidatePortalNotificationUnread({ notificationId }));
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllCandidatePortalNotificationsRead();
      router.refresh();
    });
  }

  function deleteOne(notificationId: string) {
    startTransition(async () => {
      await deleteCandidatePortalNotification({ notificationId });
      router.refresh();
    });
  }

  function deleteAll() {
    startTransition(async () => {
      await deleteAllCandidatePortalNotifications();
      router.refresh();
    });
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <CalendarIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You&apos;ll see updates here when there&apos;s activity on your applications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={isPending}>
            Mark all as read
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={deleteAll} disabled={isPending}>
          Clear all
        </Button>
      </div>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors",
            !notification.read && "border-primary/30 bg-primary/[0.03]",
          )}
        >
          <div className="mt-0.5 shrink-0">
            <NotificationIcon type={notification.type} />
          </div>
          <div className="min-w-0 flex-1">
            {notification.href ? (
              <Link
                href={notification.href as Route}
                onClick={() => !notification.read && markRead(notification.id, true)}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {notification.title}
              </Link>
            ) : (
              <p className="text-sm font-medium text-foreground">{notification.title}</p>
            )}
            {notification.body ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatRelative(new Date(notification.createdAt))}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => markRead(notification.id, notification.read)}
              disabled={isPending}
            >
              {notification.read ? "Mark unread" : "Mark read"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete notification"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => deleteOne(notification.id)}
              disabled={isPending}
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
