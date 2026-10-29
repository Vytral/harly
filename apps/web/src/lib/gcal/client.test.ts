import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "google-auth-library";

import { IntegrationHttpError } from "@/features/integrations/health/model";

import { GoogleCalendarFreeBusyError, getFreeBusy } from "./client";

const client = {
  getAccessToken: async () => ({ token: "ya29.test-access-token" }),
} as unknown as OAuth2Client;

const from = new Date("2030-06-01T09:00:00.000Z");
const to = new Date("2030-06-01T10:00:00.000Z");

function googleResponse(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getFreeBusy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns busy intervals for a calendar Google could read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        googleResponse(200, {
          calendars: {
            primary: { busy: [{ start: "2030-06-01T09:15:00Z", end: "2030-06-01T09:45:00Z" }] },
          },
        }),
      ),
    );

    await expect(getFreeBusy(client, "primary", from, to)).resolves.toEqual([
      { start: "2030-06-01T09:15:00Z", end: "2030-06-01T09:45:00Z" },
    ]);
  });

  it("throws a typed error when a 200 response carries a per-calendar error instead of reporting free time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        googleResponse(200, {
          calendars: {
            "hiring@example.test": {
              errors: [{ domain: "global", reason: "notFound" }],
            },
          },
        }),
      ),
    );

    const error = await getFreeBusy(client, "hiring@example.test", from, to).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleCalendarFreeBusyError);
    expect(error).toMatchObject({ reasons: ["notFound"] });
  });

  it("treats a calendar missing from the response as unknown, not free", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => googleResponse(200, { calendars: {} })));

    await expect(getFreeBusy(client, "primary", from, to)).rejects.toBeInstanceOf(GoogleCalendarFreeBusyError);
  });

  it("keeps the HTTP status and the structured reason of a quota 403", async () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'",
        errors: [{ domain: "usageLimits", reason: "dailyLimitExceeded" }],
        status: "PERMISSION_DENIED",
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => googleResponse(403, body)));

    const error = await getFreeBusy(client, "primary", from, to).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IntegrationHttpError);
    expect(error).toMatchObject({ status: 403 });
    expect((error as IntegrationHttpError).reasons).toContain("dailyLimitExceeded");
    expect((error as Error).message.startsWith("Google Calendar API 403: ")).toBe(true);
  });
});
