/**
 * Reporting windows and workspace-local calendar math.
 *
 * Every hiring metric is counted inside a half-open window `[from, to)`. The
 * window is always made of whole calendar days in the workspace time zone, so
 * "last 30 days" means the same thing on the dashboard, the Reports page, the
 * AI tools and the scheduled email, and day/month buckets line up with it.
 *
 * This module is deliberately plain (no `server-only`, no database) so the
 * DST and month-boundary rules can be unit tested and the settings UI can
 * reuse the same validation.
 */

export const UTC_TIME_ZONE = "UTC";

export type ReportWindow = {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** IANA zone the window and every bucket inside it are computed in. */
  timeZone: string;
  /** Length in calendar days, or null for the all-time window. */
  days: number | null;
};

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type CalendarDate = { year: number; month: number; day: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** True when the value is an IANA zone the runtime knows about. */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    partsFormatter(value).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** The workspace zone, falling back to UTC for NULL or unknown names. */
export function normalizeTimeZone(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && isValidTimeZone(trimmed) ? trimmed : UTC_TIME_ZONE;
}

/** Wall-clock date and time of an instant in a zone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of a zone from UTC at an instant, in milliseconds (positive east). */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a zone's wall clock reads 00:00 on the given date.
 * Two passes re-check the offset on either side of a DST transition. If
 * midnight does not exist in that zone on that date, the first valid instant
 * after the gap is returned.
 */
export function zonedMidnight(date: CalendarDate, timeZone: string): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  let result = guess - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;

  // When local midnight falls inside a DST gap (for example America/Santiago on
  // the first Sunday of September, where 00:00 jumps to 01:00) the two passes
  // can land one hour BEFORE midnight, on the previous calendar day. Verify the
  // wall clock and, if it is early, advance by exactly the missing amount to
  // the first instant at or after local midnight.
  const wall = zonedParts(new Date(result), timeZone);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  if (wallAsUtc < guess) result += guess - wallAsUtc;

  return new Date(result);
}

/** Calendar arithmetic that never touches a time of day, so DST is irrelevant. */
export function addCalendarDays(date: CalendarDate, delta: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** `YYYY-MM-DD` for the zone's wall-clock date at an instant. */
export function localDateKey(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** `YYYY-MM` for the zone's wall-clock month at an instant. */
export function localMonthKey(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The last `days` local calendar days, today included, ending `shiftDays`
 * days earlier. `shiftDays = days` yields the equal-length window before it.
 */
export function resolveWindow(
  days: number,
  timeZone: string,
  now: Date,
  shiftDays = 0,
): ReportWindow {
  const zone = normalizeTimeZone(timeZone);
  const today = zonedParts(now, zone);
  const todayDate = { year: today.year, month: today.month, day: today.day };
  const to = zonedMidnight(addCalendarDays(todayDate, 1 - shiftDays), zone);
  const from = zonedMidnight(addCalendarDays(todayDate, -(days - 1) - shiftDays), zone);
  return { from, to, timeZone: zone, days };
}

/** The equal-length window immediately before `current`. */
export function previousWindow(current: ReportWindow, now: Date): ReportWindow {
  if (current.days == null) throw new Error("The all-time window has no previous period.");
  return resolveWindow(current.days, current.timeZone, now, current.days);
}

/** Every instant, so the window spans all recorded history. */
export function allTimeWindow(timeZone: string): ReportWindow {
  return {
    from: new Date(Date.UTC(1970, 0, 1)),
    to: new Date(Date.UTC(2100, 0, 1)),
    timeZone: normalizeTimeZone(timeZone),
    days: null,
  };
}

/** Every `YYYY-MM-DD` local day the window covers, oldest first. */
export function dayKeysInWindow(window: ReportWindow): string[] {
  if (window.days == null) throw new Error("The all-time window has no day list.");
  const first = zonedParts(window.from, window.timeZone);
  const start = { year: first.year, month: first.month, day: first.day };
  const keys: string[] = [];
  for (let i = 0; i < window.days; i++) {
    const day = addCalendarDays(start, i);
    keys.push(`${day.year}-${pad2(day.month)}-${pad2(day.day)}`);
  }
  return keys;
}

/** Whether an instant falls inside a window (half-open). */
export function isInWindow(instant: Date | string, window: ReportWindow): boolean {
  const t = (instant instanceof Date ? instant : new Date(instant)).getTime();
  return Number.isFinite(t) && t >= window.from.getTime() && t < window.to.getTime();
}

/**
 * Trailing calendar months in the zone, oldest first, ending with the current
 * month. The window starts at the first instant of the oldest month.
 */
export function trailingMonths(
  count: number,
  timeZone: string,
  now: Date,
): { keys: string[]; window: ReportWindow } {
  const zone = normalizeTimeZone(timeZone);
  const today = zonedParts(now, zone);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = today.year * 12 + (today.month - 1) - i;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    keys.push(`${year}-${pad2(month)}`);
  }
  const [firstYear, firstMonth] = keys[0].split("-").map(Number);
  const from = zonedMidnight({ year: firstYear, month: firstMonth, day: 1 }, zone);
  const nextTotal = today.year * 12 + today.month;
  const to = zonedMidnight(
    { year: Math.floor(nextTotal / 12), month: (nextTotal % 12) + 1, day: 1 },
    zone,
  );
  return { keys, window: { from, to, timeZone: zone, days: null } };
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Short month name for a `YYYY-MM` key. */
export function monthLabel(monthKey: string): string {
  const month = Number(monthKey.split("-")[1]);
  return MONTH_LABELS[month - 1] ?? monthKey;
}

const SHORT_DAY = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: UTC_TIME_ZONE,
});

/** `Oct 28` for a `YYYY-MM-DD` key. Pure calendar formatting, no zone shift. */
export function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return SHORT_DAY.format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Percent change from `previous` to `current`, rounded to a whole percent.
 * `null` when there is no previous value to compare against (zero, or
 * missing), so the UI shows a dash rather than "100%" or "NaN".
 */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous) || previous === 0) return null;
  if (!Number.isFinite(current)) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
