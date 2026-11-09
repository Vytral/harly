/**
 * Interview date/time rendering shared by candidate emails and the in-app
 * confirmation text. Pure and dependency-free so both server paths and tests
 * use exactly the same output.
 *
 * Rules:
 * - Always format with an explicit IANA `timeZone`; never the process zone.
 * - Always print the zone label, e.g. `Tue, 4 Nov 2026, 3:00 PM (Europe/Madrid)`.
 * - Queued payloads created before zones were recorded have no zone and render
 *   in UTC with a "UTC" label, so the candidate can see what zone is shown.
 */

export const DEFAULT_INTERVIEW_TIME_ZONE = "UTC";

/** True when `value` is an IANA zone the runtime's Intl database accepts. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the first valid zone from the candidates (request zone, then the
 * scheduler's profile zone), falling back to UTC.
 */
export function resolveInterviewTimeZone(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && isValidTimeZone(trimmed)) return trimmed;
  }
  return DEFAULT_INTERVIEW_TIME_ZONE;
}

/**
 * `Tue, 4 Nov 2026, 3:00 PM (Europe/Madrid)`; invalid/missing zones use UTC.
 * `locale` picks the month and weekday names and whether the clock is 12 or
 * 24 hours. The layout stays "weekday, day month year, time (zone)".
 */
export function formatInterviewWhen(
  when: Date,
  timeZone?: string | null,
  locale = "en-US",
): string {
  const zone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_INTERVIEW_TIME_ZONE;
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: locale.toLowerCase().startsWith("en"),
  }).formatToParts(when);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const dayPeriod = pick("dayPeriod");
  const clock = `${pick("hour")}:${pick("minute")}${dayPeriod ? ` ${dayPeriod}` : ""}`;
  return `${pick("weekday")}, ${pick("day")} ${pick("month")} ${pick("year")}, ${clock} (${zone})`;
}
