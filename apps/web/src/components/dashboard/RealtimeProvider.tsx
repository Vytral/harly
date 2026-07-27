"use client";

import { useEffect } from "react";

export type RealtimeClientEvent = {
  eventId?: string;
  eventName: string;
  eventVersion?: number;
  schemaVersion?: number;
  workspaceId?: string;
  payload?: Record<string, unknown>;
};

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let stopped = false;
    const seen = new Set<string>();

    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/realtime");
      const handleMessage = (message: MessageEvent<string>) => {
        try {
          const event = JSON.parse(message.data) as RealtimeClientEvent;
          if (event.eventId) {
            if (seen.has(event.eventId)) return;
            seen.add(event.eventId);
            if (seen.size > 500) {
              const oldest = seen.values().next().value;
              if (oldest) seen.delete(oldest);
            }
          }
          window.dispatchEvent(
            new CustomEvent<RealtimeClientEvent>("harly:realtime", {
              detail: event,
            }),
          );
        } catch {
          // Ignore malformed payloads; the next event remains processable.
        }
      };
      source.onmessage = handleMessage;
      for (const eventName of [
        "domain.invalidate",
        "notifications.invalidate",
        "inbox.invalidate",
        "dashboard.invalidate",
      ]) {
        source.addEventListener(eventName, handleMessage as EventListener);
      }
      source.onerror = () => {
        source?.close();
        if (!stopped && retryTimer === undefined) {
          retryTimer = window.setTimeout(() => {
            retryTimer = undefined;
            connect();
          }, 2_000);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return children;
}

export function useRealtimeEvent(
  eventName: string,
  handler: (event: RealtimeClientEvent) => void,
) {
  useEffect(() => {
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeClientEvent>).detail;
      if (detail?.eventName === eventName) handler(detail);
    };
    window.addEventListener("harly:realtime", onEvent);
    return () => window.removeEventListener("harly:realtime", onEvent);
  }, [eventName, handler]);
}
