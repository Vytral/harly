import { afterEach, describe, expect, it, vi } from "vitest";

const safeFetchHttp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf", () => ({ safeFetchHttp }));

import { cancelCalBooking, listCalEventTypes } from "./client";

const config = {
  apiKey: "cal_test_key",
  baseUrl: "https://cal.test/v2",
  bookingUrl: null,
  defaultEventTypeId: null,
  webhookSecret: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  safeFetchHttp.mockReset();
});

describe("cancelCalBooking", () => {
  it("cancels a booking with the pinned API headers", async () => {
    safeFetchHttp.mockResolvedValue(
      new Response(JSON.stringify({ status: "success", data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(cancelCalBooking(config, "booking/uid")).resolves.toBe(true);
    expect(safeFetchHttp).toHaveBeenCalledWith(
      "https://cal.test/v2/bookings/booking%2Fuid/cancel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer cal_test_key",
          "cal-api-version": "2024-08-13",
        }),
      }),
    );
  });

  it("treats an already-cancelled booking as idempotent success", async () => {
    safeFetchHttp
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Already cancelled" } }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "success", data: { status: "cancelled" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(cancelCalBooking(config, "booking-uid")).resolves.toBe(true);
    expect(safeFetchHttp).toHaveBeenCalledTimes(2);
    expect(safeFetchHttp.mock.calls[1]?.[0]).toBe(
      "https://cal.test/v2/bookings/booking-uid",
    );
  });
});

describe("listCalEventTypes", () => {
  it("returns normalized live event types and keeps the provider cursor opaque", async () => {
    // Fresh Response per call: a real fetch body can only be read once.
    safeFetchHttp.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "success",
          data: [
            {
              id: 42,
              title: "Recruiter screen",
              slug: "recruiter-screen",
              length: 30,
              hidden: false,
            },
          ],
          nextCursor: "provider-cursor-2",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(listCalEventTypes(config, { query: "screen" })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 42,
          title: "Recruiter screen",
          slug: "recruiter-screen",
          length: 30,
          hidden: false,
        }),
      ],
      nextCursor: "provider-cursor-2",
    });
    expect(safeFetchHttp).toHaveBeenCalledWith(
      "https://cal.test/v2/event-types?limit=50",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cal_test_key",
          "cal-api-version": "2024-06-14",
        }),
      }),
    );
  });

  it("follows pages when a query match sits beyond the first page", async () => {
    safeFetchHttp
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            data: [
              { id: 1, title: "Coffee chat", slug: "coffee", length: 15, hidden: false },
            ],
            nextCursor: "page-2",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            data: [
              { id: 2, title: "Recruiter screen", slug: "screen", length: 30, hidden: false },
            ],
            nextCursor: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await expect(listCalEventTypes(config, { query: "screen" })).resolves.toEqual({
      items: [expect.objectContaining({ id: 2, title: "Recruiter screen" })],
      nextCursor: null,
    });
    expect(safeFetchHttp).toHaveBeenCalledTimes(2);
  });
});
