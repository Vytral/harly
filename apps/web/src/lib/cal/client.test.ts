import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelCalBooking } from "./client";

const config = {
  apiKey: "cal_test_key",
  baseUrl: "https://cal.test/v2",
  bookingUrl: null,
  defaultEventTypeId: null,
  webhookSecret: null,
};

afterEach(() => vi.restoreAllMocks());

describe("cancelCalBooking", () => {
  it("cancels a booking with the pinned API headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success", data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(cancelCalBooking(config, "booking/uid")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
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
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://cal.test/v2/bookings/booking-uid",
    );
  });
});
