import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { WorkspaceCalConfig } from "@/lib/cal/config";
import { safeFetchHttp } from "@/lib/ssrf";

/**
 * Cal.com API v2 client + webhook signature verification.
 *
 * Auth is `Authorization: Bearer <cal_…>` and every call must send a
 * `cal-api-version` header. Versions are pinned per endpoint family; bump these
 * deliberately after checking the Cal.com changelog.
 */
const BOOKINGS_API_VERSION = "2024-08-13";
const WEBHOOKS_API_VERSION = "2024-08-13";
const ME_API_VERSION = "2024-06-14";

export const CAL_WEBHOOK_TRIGGERS = [
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
] as const;

type CalRequest = {
  config: WorkspaceCalConfig;
  path: string;
  method?: "GET" | "POST";
  apiVersion: string;
  body?: unknown;
};

async function calFetch<T>({
  config,
  path,
  method = "GET",
  apiVersion,
  body,
}: CalRequest): Promise<T> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const response = await safeFetchHttp(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "cal-api-version": apiVersion,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as {
    status?: string;
    data?: T;
    error?: { message?: string };
  } | null;

  if (!response.ok || json?.status === "error") {
    const message =
      json?.error?.message ?? `Cal.com API error (${response.status}).`;
    throw new Error(message);
  }

  return (json?.data ?? json) as T;
}

export type CalBookingResult = {
  id: number;
  uid: string;
  start: string;
  end: string;
  status: string;
};

/**
 * Validate credentials by hitting the authenticated `/me` endpoint. Throws with
 * a Cal.com-provided message on failure so the caller can surface it verbatim.
 */
export async function verifyCalConnection(
  config: Pick<WorkspaceCalConfig, "apiKey" | "baseUrl">,
): Promise<void> {
  await calFetch<unknown>({
    config: config as WorkspaceCalConfig,
    path: "/me",
    apiVersion: ME_API_VERSION,
  });
}

/** Create a booking programmatically (used when a slot is chosen in-app). */
export async function createCalBooking(
  config: WorkspaceCalConfig,
  input: {
    eventTypeId: number;
    start: string;
    attendee: { name: string; email: string; timeZone?: string };
    location?: { type: string };
    metadata?: Record<string, string>;
  },
): Promise<CalBookingResult> {
  return calFetch<CalBookingResult>({
    config,
    path: "/bookings",
    method: "POST",
    apiVersion: BOOKINGS_API_VERSION,
    body: input,
  });
}

/** Cancel a booking by UID. Safe to retry when the remote booking is already cancelled. */
export async function cancelCalBooking(
  config: WorkspaceCalConfig,
  bookingUid: string,
): Promise<boolean> {
  try {
    await calFetch<CalBookingResult>({
      config,
      path: `/bookings/${encodeURIComponent(bookingUid)}/cancel`,
      method: "POST",
      apiVersion: BOOKINGS_API_VERSION,
      body: { cancellationReason: "Candidate data deletion" },
    });
    return true;
  } catch {
    try {
      const current = await calFetch<CalBookingResult>({
        config,
        path: `/bookings/${encodeURIComponent(bookingUid)}`,
        apiVersion: BOOKINGS_API_VERSION,
      });
      return current.status.toLowerCase() === "cancelled";
    } catch {
      return false;
    }
  }
}

/** Register a webhook so Cal.com pushes booking events back to Harly. */
export async function registerCalWebhook(
  config: WorkspaceCalConfig,
  input: { subscriberUrl: string; secret: string },
): Promise<{ id: string }> {
  return calFetch<{ id: string }>({
    config,
    path: "/webhooks",
    method: "POST",
    apiVersion: WEBHOOKS_API_VERSION,
    body: {
      active: true,
      subscriberUrl: input.subscriberUrl,
      triggers: [...CAL_WEBHOOK_TRIGGERS],
      secret: input.secret,
    },
  });
}

/**
 * Verify an inbound Cal.com webhook. The signature is an HMAC-SHA256 hex digest
 * of the raw request body, keyed by the workspace's webhook secret, sent in the
 * `x-cal-signature-256` header. Constant-time compare.
 */
export function verifyCalSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
