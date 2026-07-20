export const DAY_MS = 86_400_000;

export type HiringEvent = {
  applicationId: string;
  appliedAt: Date | string;
  hiredAt: Date | string;
};

export type TimeToHireBucket = { bucket: string; count: number };

export const TIME_TO_HIRE_BUCKETS: [string, number, number][] = [
  ["0–14d", 0, 14],
  ["15–30d", 15, 30],
  ["31–60d", 31, 60],
  ["61–90d", 61, 90],
  ["90d+", 91, Infinity],
];

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function timeToHireDays(event: HiringEvent): number | null {
  const appliedAt = asDate(event.appliedAt).getTime();
  const hiredAt = asDate(event.hiredAt).getTime();

  if (!Number.isFinite(appliedAt) || !Number.isFinite(hiredAt) || hiredAt < appliedAt) {
    return null;
  }

  return Math.floor((hiredAt - appliedAt) / DAY_MS);
}

export function bucketTimeToHire(events: HiringEvent[]): TimeToHireBucket[] {
  const buckets = TIME_TO_HIRE_BUCKETS.map(([bucket]) => ({ bucket, count: 0 }));

  for (const event of events) {
    const days = timeToHireDays(event);
    if (days == null) continue;

    const index = TIME_TO_HIRE_BUCKETS.findIndex(([, min, max]) => days >= min && days <= max);
    if (index >= 0) buckets[index].count += 1;
  }

  return buckets;
}

export function averageTimeToHireDays(events: HiringEvent[]): number | null {
  const values = events
    .map((event) => {
      const appliedAt = asDate(event.appliedAt).getTime();
      const hiredAt = asDate(event.hiredAt).getTime();
      if (
        !Number.isFinite(appliedAt) ||
        !Number.isFinite(hiredAt) ||
        hiredAt < appliedAt
      ) {
        return null;
      }
      return (hiredAt - appliedAt) / DAY_MS;
    })
    .filter((days): days is number => days != null);

  return values.length > 0
    ? Math.round(values.reduce((sum, days) => sum + days, 0) / values.length)
    : null;
}

export function countEventsBetween(
  events: HiringEvent[],
  start: Date,
  end?: Date,
): number {
  const startMs = start.getTime();
  const endMs = end?.getTime();

  return events.filter((event) => {
    const hiredAt = asDate(event.hiredAt).getTime();
    return (
      Number.isFinite(hiredAt) &&
      hiredAt >= startMs &&
      (endMs == null || hiredAt < endMs)
    );
  }).length;
}
