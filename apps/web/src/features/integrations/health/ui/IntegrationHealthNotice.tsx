"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/features/workspaces/settings-ui";

import {
  INTEGRATION_STATE_LABEL,
  type IntegrationHealthState,
  type IntegrationHealthView,
} from "../model";

const STATE_TONE: Record<IntegrationHealthState, PillTone> = {
  connected: "on",
  degraded: "warn",
  needs_reconnect: "warn",
  error: "warn",
  not_connected: "off",
};

/** "3 hours ago", "yesterday", … for the "Last working" line. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.round(seconds), "second");
}

/**
 * State, "Last working" and the sanitized last error for one integration, with
 * a primary Reconnect action when the stored credential is dead. Renders
 * nothing for an integration that was never connected.
 */
export function IntegrationHealthNotice({
  health,
  reconnectHref,
  onReconnect,
  reconnecting = false,
}: {
  health: IntegrationHealthView;
  /** OAuth install link; preferred over `onReconnect` when given. */
  reconnectHref?: string;
  onReconnect?: () => void;
  reconnecting?: boolean;
}) {
  if (health.state === "not_connected") return null;

  const issue = health.state !== "connected";
  const lastWorking = health.lastOkAt
    ? formatRelativeTime(health.lastOkAt)
    : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATE_TONE[health.state]}>
            {INTEGRATION_STATE_LABEL[health.state]}
          </StatusPill>
          {lastWorking ? (
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
              Last working {lastWorking}
            </span>
          ) : null}
        </div>
        {issue && health.lastError ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-clay" aria-hidden="true" />
            <span className="break-words">{health.lastError}</span>
          </p>
        ) : null}
      </div>

      {health.reconnectRequired ? (
        reconnectHref ? (
          <Button asChild size="sm">
            <a href={reconnectHref}>
              <RotateCw className="size-4" aria-hidden="true" />
              Reconnect
            </a>
          </Button>
        ) : onReconnect ? (
          <Button size="sm" onClick={onReconnect} disabled={reconnecting}>
            <RotateCw className="size-4" aria-hidden="true" />
            {reconnecting ? "Reconnecting…" : "Reconnect"}
          </Button>
        ) : null
      ) : null}
    </div>
  );
}
