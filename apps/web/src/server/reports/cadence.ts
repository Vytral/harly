import {
  addCalendarDays,
  UTC_TIME_ZONE,
  zonedParts,
  zoneOffsetMs,
} from "@/features/reports/window";

/** Add calendar months in UTC, clamping to the last day (Jan 31 + 1 month = Feb 28/29, not Mar 3). */
export function addUtcMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The instant at which a zone's wall clock reads `wall` (the later one when the hour repeats). */
function instantAtWallClock(wall: Wall, timeZone: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const first = zoneOffsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = zoneOffsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return new Date(result);
}

function addCalendarMonths(date: { year: number; month: number; day: number }, months: number) {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(date.day, lastDay) };
}

/**
 * The next slot after `from`, one cadence step later at the same wall-clock
 * time in the workspace time zone. A daily 09:00 report stays at 09:00 local
 * across a daylight-saving change instead of drifting by an hour. Monthly steps
 * clamp to the end of a short month (Jan 31 becomes Feb 28).
 */
export function nextRun(frequency: string, from = new Date(), timeZone = UTC_TIME_ZONE): Date {
  const wall = zonedParts(from, timeZone);
  const date = { year: wall.year, month: wall.month, day: wall.day };
  const next =
    frequency === "daily"
      ? addCalendarDays(date, 1)
      : frequency === "weekly"
        ? addCalendarDays(date, 7)
        : addCalendarMonths(date, 1);
  return instantAtWallClock({ ...wall, ...next }, timeZone);
}

/**
 * The first slot strictly after `now`, stepping from the slot that just ran.
 * Anchoring on the slot, not on the tick time, keeps a late cron tick from
 * shifting the schedule, and a long outage sends one catch-up report rather
 * than a burst.
 */
export function nextRunAfter(
  frequency: string,
  slot: Date,
  now: Date,
  timeZone = UTC_TIME_ZONE,
): Date {
  let next = nextRun(frequency, slot, timeZone);
  // Bounded: a daily schedule idle for ten years still resolves in a few thousand steps.
  for (let i = 0; i < 5000 && next <= now; i += 1) next = nextRun(frequency, next, timeZone);
  return next;
}

/** Consecutive failures after which the creator is told the schedule keeps failing. */
export const SCHEDULE_FAILURE_NOTIFY_AFTER = 5;

const BACKOFF_BASE_MS = 15 * 60_000;
const BACKOFF_CAP_MS = 12 * 3_600_000;

/**
 * Delay before retrying a failed run. Doubles from 15 minutes (15m, 30m, 1h,
 * ...) up to 12 hours, and never pushes the retry past the schedule's own next
 * slot, so a failing daily report retries within the day.
 */
export function failureBackoffMs(consecutiveFailures: number): number {
  const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 20));
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
}

export function nextRetryAt(
  frequency: string,
  slot: Date,
  now: Date,
  consecutiveFailures: number,
  timeZone = UTC_TIME_ZONE,
): Date {
  const retry = new Date(now.getTime() + failureBackoffMs(consecutiveFailures));
  const regular = nextRunAfter(frequency, slot, now, timeZone);
  return retry < regular ? retry : regular;
}
