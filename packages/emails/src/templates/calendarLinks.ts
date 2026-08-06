/**
 * Generate "Add to Google Calendar" and "Add to Apple Calendar" (.ics data URI)
 * links for interview email templates.
 */

type CalendarLinks = {
  googleCalendarUrl: string;
  icsDataUri: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toGCalDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

function toIcsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function generateUid(): string {
  return `interview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@harly`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function buildCalendarLinks(opts: {
  summary: string;
  start: Date;
  durationMins: number;
  description?: string;
  location?: string;
}): CalendarLinks {
  const end = new Date(opts.start.getTime() + opts.durationMins * 60_000);
  const description = opts.description ?? "";

  // Google Calendar link
  const gCalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.summary,
    dates: `${toGCalDate(opts.start)}/${toGCalDate(end)}`,
  });
  if (description) gCalParams.set("details", description);
  if (opts.location) gCalParams.set("location", opts.location);
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${gCalParams.toString()}`;

  // .ics data URI
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harly//Interview//EN",
    "BEGIN:VEVENT",
    `DTSTART:${toIcsDate(opts.start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    opts.location ? `LOCATION:${escapeIcsText(opts.location)}` : null,
    `UID:${generateUid()}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsLines)}`;

  return { googleCalendarUrl, icsDataUri };
}
