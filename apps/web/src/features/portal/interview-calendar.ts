/**
 * "Add to calendar" for portal interviews: an RFC 5545 .ics file (Apple
 * Calendar, Outlook) and a Google Calendar template link. Pure string
 * builders, no network, so the candidate's calendar data never leaves their
 * browser.
 */

export type CalendarInterview = {
  id: string;
  title: string;
  start: Date;
  durationMins: number;
  /** Meeting link or street address. */
  location?: string | null;
  description?: string | null;
};

/** 20261031T143000Z */
function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values (RFC 5545 §3.3.11). */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/** Fold content lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) {
    parts.push((i === 0 ? "" : " ") + line.slice(i, i + 74));
  }
  return parts.join("\r\n");
}

export function interviewEnd(interview: CalendarInterview): Date {
  return new Date(interview.start.getTime() + interview.durationMins * 60_000);
}

export function buildInterviewIcs(interview: CalendarInterview, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harly//Candidate Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${interview.id}@harly`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(interview.start)}`,
    `DTEND:${icsDate(interviewEnd(interview))}`,
    `SUMMARY:${icsText(interview.title)}`,
  ];
  if (interview.location) lines.push(`LOCATION:${icsText(interview.location)}`);
  if (interview.description) lines.push(`DESCRIPTION:${icsText(interview.description)}`);
  if (interview.location && /^https?:\/\//i.test(interview.location)) {
    lines.push(`URL:${interview.location}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(interview: CalendarInterview): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: interview.title,
    dates: `${icsDate(interview.start)}/${icsDate(interviewEnd(interview))}`,
  });
  if (interview.location) params.set("location", interview.location);
  if (interview.description) params.set("details", interview.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A filesystem-safe name: "Technical interview.ics". */
export function icsFileName(title: string): string {
  const base = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60);
  return `${base || "interview"}.ics`;
}
