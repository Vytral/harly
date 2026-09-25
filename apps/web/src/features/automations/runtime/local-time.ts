type ZonedWallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

function zonedOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function resolveWallClock(value: ZonedWallClock, timeZone: string): Date | null {
  const wallMs = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
  let candidate = new Date(wallMs);
  const seen = new Set<number>();
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const nextMs = wallMs - zonedOffsetMs(candidate, timeZone);
    if (nextMs === candidate.getTime()) {
      const roundTrip = zonedParts(candidate, timeZone);
      return roundTrip.year === value.year && roundTrip.month === value.month &&
        roundTrip.day === value.day && roundTrip.hour === value.hour &&
        roundTrip.minute === value.minute && roundTrip.second === value.second
        ? candidate : null;
    }
    if (seen.has(nextMs)) return null;
    seen.add(nextMs);
    candidate = new Date(nextMs);
  }
  return null;
}

/** Pure wall-clock deadline shared by the durable worker and the simulator. */
export function nextLocalDeadline(
  localTime: string | undefined,
  timeZone: string | undefined,
  now = new Date(),
): Date {
  if (!localTime || !timeZone) throw new Error("INVALID_LOCAL_TIME_CONFIG");
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new Error("INVALID_LOCAL_TIME_CONFIG");
  const current = zonedParts(now, timeZone);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const target = new Date(Date.UTC(current.year, current.month - 1, current.day + dayOffset, hour, minute, 0));
    const candidate = resolveWallClock({
      year: target.getUTCFullYear(), month: target.getUTCMonth() + 1,
      day: target.getUTCDate(), hour, minute, second: 0,
    }, timeZone);
    if (candidate && candidate > now) return candidate;
  }
  throw new Error("INVALID_LOCAL_TIME_CONFIG");
}
