"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CheckCheck, Eye, EyeOff, MoreHorizontal, Trash2 } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  deleteNotification,
  deleteAllNotifications,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/data";
import { NotificationTypeIconSmall } from "@/features/notifications/notification-icons";
import { ActorAvatar } from "@/features/notifications/actor-avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpotEmpty } from "@/components/ui/spot-illustrations";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import {
  headerCornerBadge,
  headerRoundButton,
} from "@/components/dashboard/header-styles";
import { useRealtimeEvent } from "@/components/dashboard/RealtimeProvider";

type Filter = "all" | "unread";

/** Splits a newest-first list into "Today" and "Earlier" (viewer's local day). */
function groupByDay(items: NotificationItem[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];
  for (const item of items) {
    (new Date(item.createdAt) >= startOfToday ? today : earlier).push(item);
  }
  return [
    { label: "today", items: today },
    { label: "earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

/** Header bell with unread badge and a quick peek at recent notifications. */
export function NotificationsBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const t = useTranslations("shell.notifications");
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [count, setCount] = useState(unreadCount);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const confirm = useConfirm();
  const unread = count;
  const visible = filter === "unread" ? items.filter((item) => !item.read) : items;
  const groups = groupByDay(visible);

  const reloadNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications?limit=50", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      notifications: NotificationItem[];
      unreadCount: number;
    };
    setItems(data.notifications);
    setCount(data.unreadCount);
  }, []);

  useRealtimeEvent("notifications.invalidate", reloadNotifications);

  function openItem(item: NotificationItem) {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      if (!item.read) {
        try {
          const result = await markNotificationRead({
            notificationId: item.id,
          });
          if (!result.success) setError(t("markReadError"));
        } catch {
          setError(t("markReadError"));
        }
      }
      if (item.href) {
        router.push(item.href as Route);
      }
      await reloadNotifications();
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
          setError(t("updateError"));
          return;
        }
      } catch {
        setError(t("updateError"));
        return;
      }
      await reloadNotifications();
    });
  }

  function dismiss(item: NotificationItem) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteNotification({ notificationId: item.id });
        if (!result.success) {
          setError(t("deleteError"));
          return;
        }
      } catch {
        setError(t("deleteError"));
        return;
      }
      await reloadNotifications();
    });
  }

  function markAll() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markAllNotificationsRead();
        if (!result.success) {
          setError(t("markAllError"));
          return;
        }
      } catch {
        setError(t("markAllError"));
        return;
      }
      await reloadNotifications();
    });
  }

  async function removeAll() {
    const ok = await confirm({
      tone: "destructive",
      title: t("confirmTitle"),
      description: t("confirmDescription"),
      confirmLabel: t("clearAll"),
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAllNotifications();
        if (!result.success) {
          setError(t("deleteAllError"));
          return;
        }
      } catch {
        setError(t("deleteAllError"));
        return;
      }
      setOpen(false);
      await reloadNotifications();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={headerRoundButton}
          aria-label={
            unread > 0 ? t("unreadAria", { count: unread }) : t("title")
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 ? (
            <span aria-hidden="true" className={headerCornerBadge}>
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[400px] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
              {t("title")}
            </p>
            {unread > 0 ? (
              <span className="rounded-full bg-chartreuse-signal px-1.5 text-[11px] font-medium leading-[18px] text-chartreuse-ink tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[12.5px] text-soft-ink"
                onClick={markAll}
                disabled={isPending}
              >
                <CheckCheck className="size-3.5" />
                {t("markAll")}
              </Button>
            ) : null}
            {items.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7 text-soft-ink"
                    aria-label={t("moreActions")}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => void removeAll()}
                    disabled={isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    {t("clearAll")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div role="tablist" aria-label={t("filter")} className="flex gap-1 border-b border-hairline px-4">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "-mb-px border-b-2 px-1.5 pb-2 text-[13px] font-medium transition-colors duration-150",
                filter === value
                  ? "border-near-ink text-near-ink"
                  : "border-transparent text-soft-ink hover:text-near-ink",
              )}
            >
              {value === "all" ? t("all") : unread > 0 ? t("unreadCount", { count: unread }) : t("unread")}
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="border-b border-hairline px-4 py-2 text-[12.5px] text-danger-rust">
            {error}
          </p>
        ) : null}

        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <SpotEmpty size={72} />
            <p className="text-[14px] font-medium text-near-ink">
              {filter === "unread" ? t("noUnread") : t("caughtUp")}
            </p>
            <p className="text-[12.5px] text-soft-ink">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto overscroll-contain p-1.5">
            {groups.map((group) => (
              <section key={group.label} aria-label={t(group.label)}>
                <p className="type-col-head px-2.5 pb-1 pt-2">{t(group.label)}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        "group relative flex items-start gap-3 rounded-[var(--radius-inner)] transition-colors duration-150",
                        "hover:bg-row-wash focus-within:bg-row-wash",
                        !item.read && "bg-lime-wash/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        disabled={isPending}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-inner)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                      >
                        <span className="relative mt-0.5 shrink-0">
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
                        <span className="min-w-0 flex-1 pr-14">
                          <span
                            className={cn(
                              "block text-[13.5px] leading-snug",
                              item.read ? "text-soft-ink" : "font-medium text-near-ink",
                            )}
                          >
                            {item.title}
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-soft-ink">
                              {item.body}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-[11.5px] text-quiet-mist">
                            <RelativeTime value={item.createdAt} />
                          </span>
                        </span>
                      </button>
                      {!item.read ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-3 top-4 size-2 rounded-full bg-chartreuse-signal ring-2 ring-pure-snow transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0"
                        />
                      ) : null}
                      <span className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => toggleRead(item)}
                          disabled={isPending}
                          aria-label={item.read ? t("markUnread") : t("markRead")}
                          title={item.read ? t("markUnread") : t("markRead")}
                          className="grid size-7 place-items-center rounded-md text-soft-ink hover:bg-pure-snow hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                        >
                          {item.read ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => dismiss(item)}
                          disabled={isPending}
                          aria-label={t("deleteNotification")}
                          title={t("delete")}
                          className="grid size-7 place-items-center rounded-md text-soft-ink hover:bg-pure-snow hover:text-danger-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
