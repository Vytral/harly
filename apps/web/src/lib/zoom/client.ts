import "server-only";

import { getZoomCredentials, getZoomToken } from "./config";

type ZoomMeeting = {
  id: number;
  join_url: string;
  topic: string;
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
      type: params.type ?? 2,
      start_time: params.start_time,
      duration: params.duration,
      timezone: params.timezone ?? "UTC",
    }),
  });
}

export async function deleteMeeting(
  workspaceId: string,
  meetingId: string,
): Promise<void> {
  await zoomFetch(workspaceId, `/v2/meetings/${meetingId}`, {
    method: "DELETE",
  });
}
