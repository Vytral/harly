import "server-only";

import {
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";

import { getZoomToken } from "./config";
import { refreshZoomAccessToken } from "./oauth";

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

function sendZoomRequest(
  token: string,
  path: string,
  options: RequestInit,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`https://api.zoom.us${path}`, { ...options, headers });
}

/**
 * Call the Zoom REST API as the workspace. A 401 triggers one OAuth refresh
 * (the rotated pair is persisted) and one retry. Every outcome is recorded in
 * the integration health model.
 */
export async function zoomFetch<T>(
  workspaceId: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getZoomToken(workspaceId);
  if (!token) {
    throw new ZoomAPIError("Zoom is not installed.", 401, 0);
  }

  let response = await sendZoomRequest(token, path, options);

  if (response.status === 401) {
    const refreshed = await refreshZoomAccessToken(workspaceId);
    if (!refreshed.ok) {
      // The refresh already recorded its failure, so do not record it twice.
      throw new ZoomAPIError(refreshed.error, 401, 0);
    }
    response = await sendZoomRequest(refreshed.accessToken, path, options);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error_code?: number } | null;
    const error = new ZoomAPIError(
      body?.message ?? `Zoom API error: ${response.status}`,
      response.status,
      body?.error_code ?? response.status,
    );
    await recordIntegrationFailure(workspaceId, "zoom", error);
    throw error;
  }

  await recordIntegrationSuccess(workspaceId, "zoom");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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
