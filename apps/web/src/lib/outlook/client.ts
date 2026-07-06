import "server-only";

import { encryptSecret } from "@/lib/crypto";
import { db, workspaceSettings } from "@harly/db";
import { eq } from "drizzle-orm";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

type OutlookCalendar = {
  id: string;
  name: string;
  canEdit: boolean;
  isDefaultCalendar: boolean;
};

type OutlookUser = {
  id: string;
  mail: string | null;
  displayName: string;
};

type OutlookEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isOnlineMeeting: boolean;
  onlineMeeting?: { joinUrl?: string };
  webLink: string;
};

/**
 * Generic fetch wrapper for Microsoft Graph API with automatic token refresh.
 */
export async function outlookFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft Graph API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Refresh an expired OAuth2 access token using the refresh token. */
export async function refreshOutlookToken(opts: {
  workspaceId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        refresh_token: opts.refreshToken,
        grant_type: "refresh_token",
        scope: "Cal.ReadWrite Mail.Send offline_access User.Read OnlineMeetings.ReadWrite",
      }),
    },
  );

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `Token refresh failed: ${data.error ?? "unknown"} — ${data.error_description ?? ""}`,
    );
  }

  // Update stored tokens (refresh token may rotate)
  const newRefreshToken = data.refresh_token ?? opts.refreshToken;
  const encryptedAccess = encryptSecret(data.access_token);
  const encryptedRefresh = encryptSecret(newRefreshToken);

  await db
    .update(workspaceSettings)
    .set({
      outlookAccessTokenCiphertext: encryptedAccess.ciphertext,
      outlookAccessTokenIv: encryptedAccess.iv,
      outlookAccessTokenTag: encryptedAccess.tag,
      outlookRefreshTokenCiphertext: encryptedRefresh.ciphertext,
      outlookRefreshTokenIv: encryptedRefresh.iv,
      outlookRefreshTokenTag: encryptedRefresh.tag,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, opts.workspaceId));

  return data.access_token;
}

/** Get the authenticated user's profile. */
export async function getMe(
  accessToken: string,
): Promise<OutlookUser> {
  return outlookFetch<OutlookUser>(accessToken, "/me");
}

/** List calendars the user can write to. */
export async function listCalendars(
  accessToken: string,
): Promise<OutlookCalendar[]> {
  const data = await outlookFetch<{ value?: OutlookCalendar[] }>(
    accessToken,
    "/me/calendars?$filter=canEdit eq true",
  );
  return data.value ?? [];
}

/** Create a calendar event with optional Teams meeting. */
export async function createEvent(
  accessToken: string,
  calendarId: string | null,
  event: {
    subject: string;
    body?: string;
    start: Date;
    durationMins: number;
    attendees?: string[];
    location?: string;
    onlineMeeting?: boolean;
  },
): Promise<OutlookEvent> {
  const startIso = event.start.toISOString();
  const endIso = new Date(
    event.start.getTime() + event.durationMins * 60_000,
  ).toISOString();

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body: Record<string, unknown> = {
    subject: event.subject,
    body: event.body
      ? { contentType: "HTML", content: event.body }
      : undefined,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone },
    location: event.location ? { displayName: event.location } : undefined,
    attendees: event.attendees?.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
    isOnlineMeeting: event.onlineMeeting ?? false,
    onlineMeetingProvider: event.onlineMeeting ? "teamsForBusiness" : undefined,
  };

  const endpoint = calendarId
    ? `/me/calendars/${encodeURIComponent(calendarId)}/events`
    : "/me/events";

  return outlookFetch<OutlookEvent>(accessToken, endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Update an existing calendar event. */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  updates: {
    subject?: string;
    body?: string;
    start?: Date;
    durationMins?: number;
    attendees?: string[];
    location?: string;
  },
): Promise<OutlookEvent> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body: Record<string, unknown> = {};
  if (updates.subject) body.subject = updates.subject;
  if (updates.body) body.body = { contentType: "HTML", content: updates.body };
  if (updates.location) body.location = { displayName: updates.location };
  if (updates.attendees) {
    body.attendees = updates.attendees.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    }));
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

  return outlookFetch<OutlookEvent>(accessToken, `/me/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Delete a calendar event. */
export async function deleteEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/me/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`Microsoft Graph API ${res.status}: ${body}`);
  }
}

type OutlookOnlineMeeting = {
  id: string;
  joinUrl: string;
  joinWebUrl: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
};

/** Send an email via Microsoft Graph. */
export async function sendMail(
  accessToken: string,
  email: {
    to: string[];
    subject: string;
    body: string;
    replyTo?: string;
  },
): Promise<void> {
  const message = {
    toRecipients: email.to.map((addr) => ({
      emailAddress: { address: addr },
    })),
    subject: email.subject,
    body: { contentType: "HTML", content: email.body },
    replyTo: email.replyTo
      ? [{ emailAddress: { address: email.replyTo } }]
      : undefined,
  };

  await outlookFetch(accessToken, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/** Create a standalone Teams online meeting. */
export async function createTeamsMeeting(
  accessToken: string,
  meeting: {
    subject: string;
    start: Date;
    durationMins: number;
  },
): Promise<OutlookOnlineMeeting> {
  const startIso = meeting.start.toISOString();
  const endIso = new Date(
    meeting.start.getTime() + meeting.durationMins * 60_000,
  ).toISOString();

  return outlookFetch<OutlookOnlineMeeting>(accessToken, "/me/onlineMeetings", {
    method: "POST",
    body: JSON.stringify({
      subject: meeting.subject,
      startDateTime: startIso,
      endDateTime: endIso,
    }),
  });
}

/** Delete a Teams online meeting. */
export async function deleteTeamsMeeting(
  accessToken: string,
  meetingId: string,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_API}/me/onlineMeetings/${encodeURIComponent(meetingId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`Microsoft Graph API ${res.status}: ${body}`);
  }
}
