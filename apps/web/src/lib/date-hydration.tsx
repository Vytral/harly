"use client";

import { useState, useEffect, type ReactNode } from "react";
import { formatShort, formatRelative, daysSince } from "./date";

/** Hydration-safe short date wrapper. Use in client components instead of formatShort(). */
export function ShortDate({ value }: { value: Date | string }): ReactNode {
  const [formatted, setFormatted] = useState(() => formatShort(value));
  useEffect(() => { setFormatted(formatShort(value)); }, [value]);
  return formatted;
}

/** Hydration-safe relative time wrapper. Use in client components instead of formatRelative(). */
export function RelativeTime({ value }: { value: Date | string }): ReactNode {
  const [formatted, setFormatted] = useState(() => formatRelative(value));
  useEffect(() => { setFormatted(formatRelative(value)); }, [value]);
  return formatted;
}

/** Hydration-safe days-since wrapper. Use in client components instead of daysSince(). */
export function DaysSince({ value }: { value: Date | string }): ReactNode {
  const [days, setDays] = useState(() => daysSince(value));
  useEffect(() => { setDays(daysSince(value)); }, [value]);
  return days;
}
