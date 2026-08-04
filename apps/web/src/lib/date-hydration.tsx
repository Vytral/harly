"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { formatShort, formatRelative, daysSince } from "./date";

/**
 * These wrappers render time-derived strings that depend on the current clock,
 * so the server value and the client value can legitimately differ , not just
 * environment differences, but the real minutes/seconds that pass between the
 * server render and the moment the client hydrates (e.g. "47 minutes ago" on
 * the server ticking to "48 minutes ago" by the time the client paints).
 *
 * `useSyncExternalStore`'s server-snapshot argument only avoids a mismatch if
 * it's genuinely fixed. Passing `compute` for it (the previous bug here) still
 * re-reads the live clock at hydration time, producing a different string than
 * whatever the server happened to render moments earlier. The server snapshot
 * must be a constant instead; React then automatically re-renders with the
 * live `getSnapshot` value right after hydration , no manual effect needed.
 */
const noopSubscribe = () => () => {};

function useClientValue<T>(compute: () => T, placeholder: T): T {
  return useSyncExternalStore(noopSubscribe, compute, () => placeholder);
}

/** Hydration-safe short date wrapper. Use in client components instead of formatShort(). */
export function ShortDate({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => formatShort(value), "");
}

/** Hydration-safe relative time wrapper. Use in client components instead of formatRelative(). */
export function RelativeTime({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => formatRelative(value), "");
}

/** Hydration-safe days-since wrapper. Use in client components instead of daysSince(). */
export function DaysSince({ value }: { value: Date | string }): ReactNode {
  return useClientValue(() => daysSince(value), 0);
}

/** Hydration-safe days-since as a number, for banding/coloring logic (not just display). */
export function useDaysSince(value: Date | string): number {
  return useClientValue(() => daysSince(value), 0);
}
