/**
 * Auto-update maintenance window. Pure and client-safe: the server decides with
 * it before queueing an update, and the settings page uses it to show when the
 * next window opens.
 *
 * Days are ISO weekdays (1 = Monday … 7 = Sunday). The window runs from
 * `startHour` (inclusive) to `endHour` (exclusive), in `timezone`, and may
 * cross midnight (22 → 05). A window that crosses midnight belongs to the day
 * it *starts* on: Friday 22 → 05 covers Saturday 00:00–04:59.
 */

export type UpdateWindow = {
  days: readonly number[];
  startHour: number;
  endHour: number;
  timezone: string;
};

export const DEFAULT_UPDATE_WINDOW: Omit<UpdateWindow, "timezone"> = {
  days: [1, 2, 3, 4, 5],
  startHour: 2,
  endHour: 5,
};

const WEEKDAY_NUMBER: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Why a window cannot be used, or null when it is valid. */
export function validateUpdateWindow(window: UpdateWindow): string | null {
  if (
    window.days.length === 0 ||
    window.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    return "Pick at least one day.";
  }
  const hourOk = (hour: number) =>
    Number.isInteger(hour) && hour >= 0 && hour <= 23;
  if (!hourOk(window.startHour) || !hourOk(window.endHour)) {
    return "Hours must be between 0 and 23.";
  }
  if (window.startHour === window.endHour) {
    return "The window needs a start hour that differs from its end hour.";
  }
  if (!isValidTimezone(window.timezone)) return "Unknown time zone.";
  return null;
}

/** ISO weekday and hour of `instant` as a wall clock in `timezone`. */
function localParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return { day: WEEKDAY_NUMBER[weekday] ?? 0, hour: hour === 24 ? 0 : hour };
}

/**
 * True when `now` falls inside the window. An invalid window never allows an
 * update: failing closed means a bad setting delays an update, never forces one.
 */
export function isWithinUpdateWindow(now: Date, window: UpdateWindow): boolean {
  if (validateUpdateWindow(window) !== null) return false;
  const { day, hour } = localParts(now, window.timezone);
  if (day === 0 || Number.isNaN(hour)) return false;

  if (window.startHour < window.endHour) {
    return (
      window.days.includes(day) && hour >= window.startHour && hour < window.endHour
    );
  }
  // Crosses midnight: the evening part belongs to `day`, the early-morning part
  // to the day before.
  if (hour >= window.startHour) return window.days.includes(day);
  if (hour < window.endHour) return window.days.includes(day === 1 ? 7 : day - 1);
  return false;
}

/**
 * The next instant (to the quarter hour) the window is open, searching up to eight days
 * ahead. Null for an invalid window. Used for display only.
 */
export function nextUpdateWindowStart(
  now: Date,
  window: UpdateWindow,
): Date | null {
  if (validateUpdateWindow(window) !== null) return null;
  if (isWithinUpdateWindow(now, window)) return now;
  // Quarter-hour steps also land on the boundary in zones with 30/45-minute
  // offsets (India, Nepal).
  const step = 15 * 60 * 1000;
  const horizon = now.getTime() + 8 * 24 * 60 * 60 * 1000;
  for (let t = Math.floor(now.getTime() / step) * step + step; t < horizon; t += step) {
    const candidate = new Date(t);
    if (isWithinUpdateWindow(candidate, window)) return candidate;
  }
  return null;
}
