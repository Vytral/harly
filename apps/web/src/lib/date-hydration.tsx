"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { formatShort, formatRelative, daysSince } from "./date";

/**
 * These wrappers render time-derived strings that depend on the current clock,
 * so the server value and the client value can legitimately differ. We use
 * `useSyncExternalStore` with distinct server/client snapshots: React renders
 * the server snapshot during SSR + the first hydration pass (so markup matches)
 * and then swaps in the live client value — no `setState`-in-effect needed.
 */
const noopSubscribe = () => () => {};

function useClientValue<T>(compute: () => T): T {
  return useSyncExternalStore(noopSubscribe, compute, compute);
}

/** Hydration-safe short date wrapper. Use in client components instead of formatShort(). */
export function ShortDate({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => formatShort(value));
}

/** Hydration-safe relative time wrapper. Use in client components instead of formatRelative(). */
export function RelativeTime({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => formatRelative(value));
}

/** Hydration-safe days-since wrapper. Use in client components instead of daysSince(). */
export function DaysSince({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => daysSince(value));
}
