import "server-only";

import type { OAuth2Client } from "google-auth-library";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

type CalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
};

type CalendarEvent = {
  id: string;
  htmlLink: string;
  status: string;
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      uri?: string;
      label?: string;
      entryPointType?: string;
    }>;
  };
};

async function gcalFetch<T>(
  client: OAuth2Client,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google access token");

  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function listCalendars(
  client: OAuth2Client,
): Promise<CalendarListEntry[]> {
  const data = await gcalFetch<{
    items?: CalendarListEntry[];
  }>(client, "/users/me/calendarList?minAccessRole=writer");
  return data.items ?? [];
}

export async function createEvent(
  client: OAuth2Client,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    start: Date;
    durationMins: number;
    attendees?: string[];
    location?: string;
    conferenceData?: boolean;
  },
): Promise<CalendarEvent> {
  const startIso = event.start.toISOString();
  const endIso = new Date(
    event.start.getTime() + event.durationMins * 60_000,
  ).toISOString();

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
    attendees: event.attendees?.map((email) => ({ email })),
    reminders: { useDefault: true },
  };

  if (event.conferenceData) {
    body.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const qs = event.conferenceData
    ? "sendUpdates=all&conferenceDataVersion=1"
    : "sendUpdates=all";

  return gcalFetch<CalendarEvent>(
    client,
    `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    start?: Date;
    durationMins?: number;
    attendees?: string[];
    location?: string;
    status?: "confirmed" | "cancelled";
  },
): Promise<CalendarEvent> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body: Record<string, unknown> = {};
  if (updates.summary) body.summary = updates.summary;
  if (updates.description) body.description = updates.description;
  if (updates.location) body.location = updates.location;
  if (updates.status) body.status = updates.status;
  if (updates.attendees) {
    body.attendees = updates.attendees.map((email) => ({ email }));
  }
  if (updates.start) {
    const startIso = updates.start.toISOString();
    body.start = { dateTime: startIso, timeZone };
    if (updates.durationMins) {
      const endIso = new Date(
        updates.start.getTime() + updates.durationMins * 60_000,
      ).toISOString();
      body.end = { dateTime: endIso, timeZone };
    }
  }

  return gcalFetch<CalendarEvent>(
    client,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain Google access token");

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok && res.status !== 410) {
    const body = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${body}`);
  }
}

export async function getFreeBusy(
  client: OAuth2Client,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<Array<{ start: string; end: string }>> {
  const data = await gcalFetch<{
    calendars?: Record<
      string,
      { busy?: Array<{ start: string; end: string }> }
    >;
  }>(client, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  return data.calendars?.[calendarId]?.busy ?? [];
}
