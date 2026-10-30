import { describe, expect, it } from "vitest";

import {
  applicationReceivedEmailDedupeKey,
  applicationStatusEmailDedupeKey,
  calBookingEmailDedupeKey,
  offerEmailDedupeKey,
  offerExtendedEmailDedupeKey,
  scheduledReportEmailDedupeKey,
} from "./dedupe-keys";

describe("calBookingEmailDedupeKey", () => {
  it("gives a redelivered Cal webhook the same key", () => {
    const first = calBookingEmailDedupeKey({
      bookingUid: "booking-1",
      triggerEvent: "BOOKING_CREATED",
      startTime: "2026-11-02T15:00:00.000Z",
    });
    const redelivered = calBookingEmailDedupeKey({
      bookingUid: "booking-1",
      triggerEvent: "BOOKING_CREATED",
      startTime: "2026-11-02T15:00:00.000Z",
    });
    expect(redelivered).toBe(first);
  });

  it("gives a reschedule to a new start time its own key", () => {
    const original = calBookingEmailDedupeKey({
      bookingUid: "booking-1",
      triggerEvent: "BOOKING_RESCHEDULED",
      startTime: "2026-11-02T15:00:00.000Z",
    });
    const moved = calBookingEmailDedupeKey({
      bookingUid: "booking-1",
      triggerEvent: "BOOKING_RESCHEDULED",
      startTime: "2026-11-03T15:00:00.000Z",
    });
    expect(moved).not.toBe(original);
  });

  it("keeps a re-booking at the same time after a cancel distinct, since Cal issues a new booking uid", () => {
    const first = calBookingEmailDedupeKey({
      bookingUid: "booking-1",
      triggerEvent: "BOOKING_CREATED",
      startTime: "2026-11-02T15:00:00.000Z",
    });
    const rebooked = calBookingEmailDedupeKey({
      bookingUid: "booking-2",
      triggerEvent: "BOOKING_CREATED",
      startTime: "2026-11-02T15:00:00.000Z",
    });
    expect(rebooked).not.toBe(first);
  });

  it("separates a create and a cancel of the same booking", () => {
    const created = calBookingEmailDedupeKey({ bookingUid: "b", triggerEvent: "BOOKING_CREATED", startTime: "t" });
    const canceled = calBookingEmailDedupeKey({ bookingUid: "b", triggerEvent: "BOOKING_CANCELLED", startTime: "t" });
    expect(canceled).not.toBe(created);
  });
});

describe("applicationStatusEmailDedupeKey", () => {
  it("dedupes the same status transition event", () => {
    expect(
      applicationStatusEmailDedupeKey({ applicationId: "app-1", status: "rejected", eventId: "evt-1" }),
    ).toBe(applicationStatusEmailDedupeKey({ applicationId: "app-1", status: "rejected", eventId: "evt-1" }));
  });

  it("gives a second rejection of the same application its own key", () => {
    expect(
      applicationStatusEmailDedupeKey({ applicationId: "app-1", status: "rejected", eventId: "evt-2" }),
    ).not.toBe(applicationStatusEmailDedupeKey({ applicationId: "app-1", status: "rejected", eventId: "evt-1" }));
  });
});

describe("applicationReceivedEmailDedupeKey", () => {
  it("keys the candidate and each recruiter per application", () => {
    const candidate = applicationReceivedEmailDedupeKey({ applicationId: "app-1", recipient: "candidate" });
    const recruiterA = applicationReceivedEmailDedupeKey({
      applicationId: "app-1",
      recipient: "recruiter",
      recipientEmail: "a@example.test",
    });
    const recruiterB = applicationReceivedEmailDedupeKey({
      applicationId: "app-1",
      recipient: "recruiter",
      recipientEmail: "b@example.test",
    });
    expect(new Set([candidate, recruiterA, recruiterB]).size).toBe(3);
  });

  it("gives a second application by the same candidate to the same owner its own recruiter email", () => {
    const first = applicationReceivedEmailDedupeKey({
      applicationId: "app-1",
      recipient: "recruiter",
      recipientEmail: "owner@example.test",
    });
    const second = applicationReceivedEmailDedupeKey({
      applicationId: "app-2",
      recipient: "recruiter",
      recipientEmail: "owner@example.test",
    });
    expect(second).not.toBe(first);
  });
});

describe("scheduledReportEmailDedupeKey", () => {
  const slot = new Date("2026-11-02T08:00:00.000Z");

  it("is stable for a period, so a retried tick does not resend", () => {
    expect(
      scheduledReportEmailDedupeKey({ scheduledReportId: "sr-1", periodStart: slot, recipient: "a@example.test" }),
    ).toBe(
      scheduledReportEmailDedupeKey({ scheduledReportId: "sr-1", periodStart: new Date(slot), recipient: "a@example.test" }),
    );
  });

  it("differs per period and per recipient", () => {
    const base = scheduledReportEmailDedupeKey({ scheduledReportId: "sr-1", periodStart: slot, recipient: "a@example.test" });
    const nextPeriod = scheduledReportEmailDedupeKey({
      scheduledReportId: "sr-1",
      periodStart: new Date("2026-11-03T08:00:00.000Z"),
      recipient: "a@example.test",
    });
    const otherRecipient = scheduledReportEmailDedupeKey({
      scheduledReportId: "sr-1",
      periodStart: slot,
      recipient: "b@example.test",
    });
    expect(nextPeriod).not.toBe(base);
    expect(otherRecipient).not.toBe(base);
  });
});

describe("offer dedupe keys", () => {
  it("gives two different offers with an identical withdrawal payload their own keys", () => {
    expect(offerEmailDedupeKey({ offerId: "offer-1", kind: "withdrawn" })).not.toBe(
      offerEmailDedupeKey({ offerId: "offer-2", kind: "withdrawn" }),
    );
  });

  it("dedupes an identical extension of the same offer", () => {
    const terms = { salary: 100, currency: "USD" };
    expect(offerExtendedEmailDedupeKey({ offerId: "offer-1", terms })).toBe(
      offerExtendedEmailDedupeKey({ offerId: "offer-1", terms: { salary: 100, currency: "USD" } }),
    );
  });

  it("gives an extension with changed terms its own key so a resend carries the new terms", () => {
    expect(offerExtendedEmailDedupeKey({ offerId: "offer-1", terms: { salary: 100 } })).not.toBe(
      offerExtendedEmailDedupeKey({ offerId: "offer-1", terms: { salary: 120 } }),
    );
  });
});
