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
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  CalendarIcon,
  TrashIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const ICON_MAP = {
  interview_scheduled: CalendarIcon,
  interview_rescheduled: CalendarIcon,
  interview_completed: CheckCircleIcon,
  application_rejected: XCircleIcon,
  application_hired: CheckCircleIcon,
} as const;

const ICON_COLOR_MAP = {
  interview_scheduled: "bg-lime-wash text-near-ink",
  interview_rescheduled: "bg-lime-wash text-near-ink",
  interview_completed: "bg-sage-wash text-success-olive",
  application_rejected: "bg-card-inset text-soft-ink",
  application_hired: "bg-sage-wash text-success-olive",
} as const;

function NotificationIcon({ type }: { type: string }) {
  const Icon = ICON_MAP[type as keyof typeof ICON_MAP] ?? CalendarIcon;
  const color = ICON_COLOR_MAP[type as keyof typeof ICON_COLOR_MAP] ?? "bg-card-inset text-soft-ink";
  return (
    <span className={cn("grid size-9 place-items-center rounded-xl", color)}>
      <Icon className="size-[18px]" />
    </span>
  );
}

export function PortalNotificationsList({
  notifications,
}: {
  notifications: CandidatePortalNotificationItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();
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

  async function deleteAll() {
    const ok = await confirm({
      tone: "destructive",
      title: "Clear all notifications?",
      description: "This removes every update from this list. Your applications are not affected.",
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteAllCandidatePortalNotifications();
      router.refresh();
    });
  }

  if (notifications.length === 0) {
    return (
      <div className="animate-empty-state rounded-2xl border border-dashed border-hairline bg-card p-10 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-card-inset text-soft-ink">
          <CalendarIcon className="size-6" />
        </span>
        <p className="text-[15px] font-semibold text-near-ink">You&apos;re all caught up</p>
        <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-5 text-soft-ink">
          You&apos;ll see updates here when there&apos;s activity on your applications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-soft-ink">
          {unreadCount > 0 ? `${unreadCount} unread` : "No unread updates"}
        </p>
        <div className="flex gap-1">
        {unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={isPending}>
            Mark all as read
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => void deleteAll()} disabled={isPending}>
          Clear all
        </Button>
        </div>
      </div>
      <ul className="stagger-in space-y-2">
      {notifications.map((notification) => (
        <li
          key={notification.id}
          className={cn(
            "group relative flex items-start gap-3 rounded-2xl border border-hairline bg-card p-4 transition-colors duration-200",
            notification.read && "bg-transparent",
          )}
        >
          {!notification.read ? (
            <span aria-hidden="true" className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-chartreuse-signal" />
          ) : null}
          <div className="shrink-0">
            <NotificationIcon type={notification.type} />
          </div>
          <div className="min-w-0 flex-1">
            {notification.href ? (
              <Link
                href={notification.href as Route}
                onClick={() => !notification.read && markRead(notification.id, true)}
                className={cn("text-[14px] text-near-ink after:absolute after:inset-0 hover:underline underline-offset-2", !notification.read && "font-semibold")}
              >
                {notification.title}
              </Link>
            ) : (
              <p className={cn("text-[14px] text-near-ink", !notification.read && "font-semibold")}>{notification.title}</p>
            )}
            {notification.body ? (
              <p className="mt-0.5 text-[13px] leading-5 text-soft-ink">{notification.body}</p>
            ) : null}
            <p className="mt-1 text-[12px] text-soft-ink">
              <RelativeTime value={notification.createdAt} />
            </p>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1 md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-soft-ink"
              onClick={() => markRead(notification.id, !notification.read)}
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
        </li>
      ))}
      </ul>
    </div>
  );
}
