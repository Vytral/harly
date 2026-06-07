const shortFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const shortWithYearFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function formatShort(value: Date | string): string {
  const date = toDate(value);
  const now = new Date();

  if (date.getFullYear() === now.getFullYear()) {
    return shortFormatter.format(date);
  }

  return shortWithYearFormatter.format(date);
}

export function formatRelative(value: Date | string): string {
  const date = toDate(value);
  const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffInSeconds);

  if (absSeconds < 60) {
    return relativeFormatter.format(diffInSeconds, "second");
  }

  const diffInMinutes = Math.round(diffInSeconds / 60);
  const absMinutes = Math.abs(diffInMinutes);

  if (absMinutes < 60) {
    return relativeFormatter.format(diffInMinutes, "minute");
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  const absHours = Math.abs(diffInHours);

  if (absHours < 24) {
    return relativeFormatter.format(diffInHours, "hour");
  }

  const diffInDays = Math.round(diffInHours / 24);
  const absDays = Math.abs(diffInDays);

  if (absDays < 30) {
    return relativeFormatter.format(diffInDays, "day");
  }

  const diffInMonths = Math.round(diffInDays / 30);
  const absMonths = Math.abs(diffInMonths);

  if (absMonths < 12) {
    return relativeFormatter.format(diffInMonths, "month");
  }

  return relativeFormatter.format(Math.round(diffInMonths / 12), "year");
}

export function daysSince(value: Date | string): number {
  const date = toDate(value);
  const diff = Date.now() - date.getTime();

  return Math.max(0, Math.floor(diff / 86_400_000));
}
