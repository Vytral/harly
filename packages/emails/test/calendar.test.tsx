import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildCalendarLinks,
  buildIcs,
  buildIcsAttachment,
  interviewIcsUid,
} from "../src/templates/calendarLinks";

const base = {
  uid: interviewIcsUid("0b7f3c1e-1111-4222-8333-444455556666"),
  summary: "Technical interview — Engineer",
  start: new Date("2026-12-01T14:00:00Z"),
  durationMins: 45,
  now: new Date("2026-11-16T09:30:00Z"),
};

test("uid is derived from the interview id, not from time or randomness", () => {
  assert.equal(interviewIcsUid("abc-123"), "abc-123@harly");
  const a = buildIcs({ ...base, method: "REQUEST", sequence: 0 });
  const b = buildIcs({ ...base, method: "REQUEST", sequence: 0, now: new Date("2027-01-01T00:00:00Z") });
  assert.match(a, /UID:0b7f3c1e-1111-4222-8333-444455556666@harly\r\n/);
  assert.equal(a.match(/UID:.*/)![0], b.match(/UID:.*/)![0]);
});

test("REQUEST carries METHOD, DTSTAMP, SEQUENCE and a confirmed status", () => {
  const ics = buildIcs({ ...base, method: "REQUEST", sequence: 3 });
  assert.match(ics, /\r\nMETHOD:REQUEST\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20261116T093000Z\r\n/);
  assert.match(ics, /\r\nSEQUENCE:3\r\n/);
  assert.match(ics, /\r\nDTSTART:20261201T140000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261201T144500Z\r\n/);
  assert.match(ics, /\r\nSTATUS:CONFIRMED\r\n/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("CANCEL addresses the same UID and is marked cancelled", () => {
  const request = buildIcs({ ...base, method: "REQUEST", sequence: 1 });
  const cancel = buildIcs({ ...base, method: "CANCEL", sequence: 2 });
  assert.match(cancel, /\r\nMETHOD:CANCEL\r\n/);
  assert.match(cancel, /\r\nSTATUS:CANCELLED\r\n/);
  assert.match(cancel, /\r\nSEQUENCE:2\r\n/);
  assert.equal(cancel.match(/UID:.*/)![0], request.match(/UID:.*/)![0]);
});

test("organizer and attendee are written when given, and long lines are folded", () => {
  const ics = buildIcs({
    ...base,
    method: "REQUEST",
    sequence: 0,
    description: "x".repeat(200),
    organizer: { email: "reply@example.test", name: 'Acme "Hiring"' },
    attendee: { email: "ava@example.test", name: "Ava Thompson" },
  });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /ORGANIZER;CN="Acme Hiring":mailto:reply@example.test\r\n/);
  assert.match(unfolded, /ATTENDEE;[^\r\n]*mailto:ava@example.test\r\n/);
  assert.ok(unfolded.includes(`DESCRIPTION:${"x".repeat(200)}`));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test("the attachment declares the iTIP method", () => {
  const attachment = buildIcsAttachment({ ...base, method: "CANCEL", sequence: 1 });
  assert.equal(attachment.filename, "invite.ics");
  assert.match(attachment.contentType, /method=CANCEL/);
  assert.match(attachment.content.toString("utf8"), /METHOD:CANCEL/);
});

test("the email .ics data link is stable for the same interview", () => {
  const first = buildCalendarLinks({ ...base, sequence: 1 });
  const second = buildCalendarLinks({ ...base, sequence: 1 });
  assert.equal(first.icsDataUri, second.icsDataUri);
  assert.match(decodeURIComponent(first.icsDataUri), /METHOD:REQUEST/);
});
