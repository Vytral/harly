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
const EVENT_TYPES_API_VERSION = "2024-06-14";

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

export type CalEventType = {
  id: number | string;
  title: string;
  slug: string;
  length: number | null;
  hidden: boolean;
  metadata: Record<string, unknown>;
};

export type CalEventTypesResult = {
  items: CalEventType[];
  nextCursor: string | null;
};

/**
 * List the event types that actually exist in the connected Cal.com account.
 * The provider cursor is kept opaque and only safe display fields cross the
 * Harly boundary; credentials and the raw provider response never do.
 *
 * The provider has no server-side search, so `query` filtering is
 * client-side by design. When a query is set we follow up to 3 pages so a
 * match on a later page is still found; without a query a single page is
 * returned. The limit clamp (1-50) matches resource-resolution so one page
 * means the same thing on both sides of the boundary.
 */
export async function listCalEventTypes(
  config: WorkspaceCalConfig,
  input: { limit?: number; cursor?: string; query?: string } = {},
): Promise<CalEventTypesResult> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 50);
  const query = input.query?.trim().toLowerCase();
  const maxPages = query ? 3 : 1;
  const collected: CalEventType[] = [];
  const seenIds = new Set<string>();
  let cursor: string | undefined = input.cursor;
  let nextCursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const single = await listCalEventTypePage(config, { limit, cursor });
    for (const item of single.items) {
      const key = String(item.id);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        collected.push(item);
      }
    }
    nextCursor = single.nextCursor;
    if (!nextCursor) break;
    cursor = nextCursor;
    if (!query && collected.length >= limit) break;
  }
  const items = query
    ? collected.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.slug.toLowerCase().includes(query) ||
          String(item.id).toLowerCase().includes(query),
      )
    : collected.slice(0, limit);
  return {
    items: query ? items.slice(0, limit) : items,
    nextCursor,
  };
}

async function listCalEventTypePage(
  config: WorkspaceCalConfig,
  input: { limit: number; cursor?: string },
): Promise<CalEventTypesResult> {
  const params = new URLSearchParams();
  params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const response = await safeFetchHttp(
    `${config.baseUrl.replace(/\/$/, "")}/event-types?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "cal-api-version": EVENT_TYPES_API_VERSION,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );
  const json = (await response.json().catch(() => null)) as {
    status?: string;
    data?: unknown;
    nextCursor?: string | null;
    pagination?: { nextCursor?: string | null };
    error?: { message?: string };
  } | null;
  if (!response.ok || json?.status === "error") {
    throw new Error(
      json?.error?.message ?? `Cal.com API error (${response.status}).`,
    );
  }

  const rawItems = Array.isArray(json?.data)
    ? json.data
    : typeof json?.data === "object" && json.data !== null && "eventTypes" in json.data
      ? (json.data as { eventTypes?: unknown[] }).eventTypes ?? []
      : [];
  const items = rawItems.flatMap((value): CalEventType[] => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const id = record.id;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const slug = typeof record.slug === "string" ? record.slug.trim() : "";
    if ((typeof id !== "number" && typeof id !== "string") || !title || !slug) {
      return [];
    }
    return [
      {
        id,
        title,
        slug,
        length:
          typeof record.length === "number"
            ? record.length
            : typeof record.duration === "number"
              ? record.duration
              : null,
        hidden: record.hidden === true,
        metadata: {
          integration: "cal",
          slug,
          length:
            typeof record.length === "number"
              ? record.length
              : typeof record.duration === "number"
                ? record.duration
                : null,
          hidden: record.hidden === true,
        },
      },
    ];
  });
  return {
    items,
    nextCursor: json?.nextCursor ?? json?.pagination?.nextCursor ?? null,
  };
}

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
