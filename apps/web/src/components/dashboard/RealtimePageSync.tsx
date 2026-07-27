"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  type RealtimeClientEvent,
  useRealtimeEvent,
} from "./RealtimeProvider";

function domainName(event: RealtimeClientEvent): string | null {
  const value = event.payload?.domainEvent;
  return typeof value === "string" ? value : null;
}

function affectsPath(pathname: string, event: RealtimeClientEvent): boolean {
  const name = domainName(event);
  const area = event.payload?.area;

  if (event.eventName === "notifications.invalidate") {
    return pathname.startsWith("/dashboard/notifications");
  }
  if (event.eventName === "inbox.invalidate" || name === "mail.received") {
    return pathname.startsWith("/dashboard/inbox") || pathname.startsWith("/dashboard/replies");
  }
  if (event.eventName === "dashboard.invalidate") {
    return area === "tasks"
      ? pathname.startsWith("/dashboard/tasks")
      : pathname.startsWith("/dashboard");
  }

  if (!name) return false;
  if (name.startsWith("task.")) return pathname.startsWith("/dashboard/tasks");
  if (name.startsWith("interview.")) {
    return pathname.startsWith("/dashboard/calendars") || pathname.startsWith("/dashboard/candidates/");
  }
  if (name.startsWith("job.")) {
    return pathname.startsWith("/dashboard/jobs") || pathname.startsWith("/dashboard/pipeline");
  }
  if (name.startsWith("application.")) {
    return pathname.startsWith("/dashboard/pipeline") || pathname.startsWith("/dashboard/candidates/") || pathname.startsWith("/dashboard/jobs");
  }
  if (name.startsWith("candidate.")) {
    return pathname.startsWith("/dashboard/candidates") || pathname.startsWith("/dashboard/pipeline");
  }
  return false;
}

/** Route-scoped bridge for server-component surfaces that do not own a query cache. */
export function RealtimePageSync() {
  const pathname = usePathname();
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);

  const refreshIfRelevant = useCallback(
    (event: RealtimeClientEvent) => {
      if (!affectsPath(pathname, event)) return;
      if (timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        router.refresh();
      }, 80);
    },
    [pathname, router],
  );

  useRealtimeEvent("domain.invalidate", refreshIfRelevant);
  useRealtimeEvent("dashboard.invalidate", refreshIfRelevant);
  useRealtimeEvent("inbox.invalidate", refreshIfRelevant);

  return null;
}
