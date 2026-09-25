import "server-only";

import { getZoomCredentials, getZoomToken } from "./config";

type ZoomMeeting = {
  id: number;
  join_url: string;
  topic: string;
  agenda?: string;
  tracking_fields?: Array<{ field: string; value: string; visible?: boolean }>;
  start_time: string;
  duration: number;
  status: string;
};

export class ZoomAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: number,
  ) {
    super(message);
    this.name = "ZoomAPIError";
  }
}

export async function zoomFetch<T>(
  workspaceId: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getZoomToken(workspaceId);
  if (!token) {
    throw new ZoomAPIError("Zoom is not installed.", 401, 0);
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`https://api.zoom.us${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error_code?: number } | null;
    throw new ZoomAPIError(
      body?.message ?? `Zoom API error: ${response.status}`,
      response.status,
      body?.error_code ?? response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function refreshZoomToken(workspaceId: string): Promise<string | null> {
  const credentials = await getZoomCredentials(workspaceId);
  if (!credentials) return null;

  const currentToken = await getZoomToken(workspaceId);
  if (!currentToken) return null;

  // Try using the current token first
  try {
    await zoomFetch<{ id: string }>(workspaceId, "/v2/users/me");
    return currentToken;
  } catch {
    // Token might be expired, try refresh
  }

  // Refresh token flow not implemented for Zoom , user needs to reconnect
  return null;
}

export async function createMeeting(
  workspaceId: string,
  params: {
    topic: string;
    /** Stable, non-user-visible marker used to recover an ambiguous create. */
    tracking_fields?: Array<{ field: string; value: string; visible?: boolean }>;
    type?: number;
    start_time?: string;
    duration?: number;
    timezone?: string;
  },
): Promise<ZoomMeeting> {
  return zoomFetch<ZoomMeeting>(workspaceId, "/v2/users/me/meetings", {
    method: "POST",
    body: JSON.stringify({
      topic: params.topic,
      tracking_fields: params.tracking_fields,
      type: params.type ?? 2,
      start_time: params.start_time,
      duration: params.duration,
      timezone: params.timezone ?? "UTC",
    }),
  });
}

/**
 * Find a meeting created by Harly after a create request timed out. Zoom does
 * not expose a create idempotency header, so the sync adapter places a stable
 * hidden tracking-field marker and requires an exact match before recovering it.
 * The bounded pagination avoids turning reconciliation into an unbounded API
 * scan for large accounts.
 */
export async function findMeetingByTrackingField(
  workspaceId: string,
  field: string,
  value: string,
): Promise<ZoomMeeting | null> {
  let nextPageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      type: "scheduled",
      page_size: "300",
    });
    if (nextPageToken) params.set("next_page_token", nextPageToken);

    const response = await zoomFetch<{
      meetings?: ZoomMeeting[];
      next_page_token?: string;
    }>(workspaceId, `/v2/users/me/meetings?${params.toString()}`);
    const match = response.meetings?.find((meeting) =>
      meeting.tracking_fields?.some(
        (trackingField) =>
          trackingField.field === field && trackingField.value === value,
      ),
    );
    if (match) return match;

    nextPageToken = response.next_page_token;
    if (!nextPageToken) break;
  }
  return null;
}

export async function deleteMeeting(
  workspaceId: string,
  meetingId: string,
): Promise<void> {
  await zoomFetch(workspaceId, `/v2/meetings/${meetingId}`, {
    method: "DELETE",
  });
}
