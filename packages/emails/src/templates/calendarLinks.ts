/**
 * Generate "Add to Google Calendar" and "Add to Apple Calendar" (.ics data URI)
 * links for interview email templates, and the iTIP .ics (REQUEST / CANCEL)
 * that is attached to interview emails. The UID is derived from the interview
 * id, so an invite, its reschedules and its cancellation all address the same
 * calendar entry.
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

function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold content lines longer than 75 octets (RFC 5545 §3.1). */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // The first line may hold 75 octets, continuation lines 74 (plus the leading space).
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

/** A calendar-address parameter value must not contain quotes or control characters. */
function icsParam(value: string): string {
  return value.replace(/["\r\n;:,]/g, " ").replace(/\s+/g, " ").trim();
}

export type IcsMethod = "REQUEST" | "CANCEL";

export type IcsOptions = {
  /**
   * Stable identity of the event. Reuse the same value for the invite, every
   * reschedule and the cancellation so calendars update one entry instead of
   * adding duplicates. Derive it from the interview id.
   */
  uid: string;
  method: IcsMethod;
  /** Revision counter: must not decrease between messages about the same UID. */
  sequence: number;
  summary: string;
  start: Date;
  durationMins: number;
  description?: string;
  location?: string;
  /** Needed for clients to treat a REQUEST/CANCEL as a scheduling message. */
  organizer?: { email: string; name?: string };
  attendee?: { email: string; name?: string };
  /** DTSTAMP; defaults to now. Tests pass a fixed value. */
  now?: Date;
};

/** An RFC 5545 / RFC 5546 iTIP message (`METHOD:REQUEST` or `METHOD:CANCEL`). */
export function buildIcs(opts: IcsOptions): string {
  const end = new Date(opts.start.getTime() + opts.durationMins * 60_000);
  const cancelled = opts.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harly//Interview//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${toIcsDate(opts.now ?? new Date())}`,
    `SEQUENCE:${Math.max(0, Math.floor(opts.sequence))}`,
    `DTSTART:${toIcsDate(opts.start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
    opts.description ? `DESCRIPTION:${escapeIcsText(opts.description)}` : null,
    opts.location ? `LOCATION:${escapeIcsText(opts.location)}` : null,
    opts.organizer
      ? `ORGANIZER${opts.organizer.name ? `;CN="${icsParam(opts.organizer.name)}"` : ""}:mailto:${opts.organizer.email}`
      : null,
    opts.organizer && opts.attendee
      ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE${opts.attendee.name ? `;CN="${icsParam(opts.attendee.name)}"` : ""}:mailto:${opts.attendee.email}`
      : null,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Stable calendar UID for an interview. */
export function interviewIcsUid(interviewId: string): string {
  return `${interviewId.replace(/[^A-Za-z0-9._-]/g, "-")}@harly`;
}

/** An email attachment that mail clients recognise as a calendar message. */
export function buildIcsAttachment(opts: IcsOptions): {
  filename: string;
  contentType: string;
  content: Buffer;
} {
  return {
    filename: "invite.ics",
    contentType: `text/calendar; charset=utf-8; method=${opts.method}`,
    content: Buffer.from(buildIcs(opts), "utf8"),
  };
}

export function buildCalendarLinks(opts: {
  summary: string;
  start: Date;
  durationMins: number;
  description?: string;
  location?: string;
  /** Interview id; makes the .ics UID stable across invite, reschedule and cancel. */
  uid: string;
  sequence?: number;
  method?: IcsMethod;
  now?: Date;
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

  const ics = buildIcs({
    uid: opts.uid,
    method: opts.method ?? "REQUEST",
    sequence: opts.sequence ?? 0,
    summary: opts.summary,
    start: opts.start,
    durationMins: opts.durationMins,
    description: opts.description,
    location: opts.location,
    now: opts.now,
  });
  const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return { googleCalendarUrl, icsDataUri };
}
