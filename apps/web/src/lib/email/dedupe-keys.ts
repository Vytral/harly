import { createHash } from "node:crypto";

/**
 * Durable dedupe keys for outbox emails. Each key names one real-world event,
 * so a retry of that event maps onto the same outbox row while a legitimate
 * repeat with an identical payload gets its own row. Callers must not change a
 * key's format without a migration plan: in-flight rows keep the old key, and a
 * retry after an upgrade would otherwise send a second copy.
 */

/**
 * One Cal.com booking webhook. A redelivery of the same trigger for the same
 * booking (and, for a reschedule, the same new start) reuses the key. A new
 * start time, a cancel, or a re-booking under a new uid gets its own key.
 */
export function calBookingEmailDedupeKey(input: {
  bookingUid: string;
  triggerEvent: string;
  startTime?: string | null;
}): string {
  return `cal-booking:${input.bookingUid}:${input.triggerEvent}:${input.startTime ?? ""}`;
}

/** One application status transition, keyed by the domain event that recorded it. */
export function applicationStatusEmailDedupeKey(input: {
  applicationId: string;
  status: "hired" | "rejected";
  eventId: string;
}): string {
  return `application-status:${input.applicationId}:${input.status}:${input.eventId}`;
}

/** The "application received" emails for one application: one for the candidate and one per recruiter. */
export function applicationReceivedEmailDedupeKey(
  input:
    | { applicationId: string; recipient: "candidate" }
    | { applicationId: string; recipient: "recruiter"; recipientEmail: string },
): string {
  if (input.recipient === "candidate") {
    return `application-received:${input.applicationId}:candidate`;
  }
  return `application-received:${input.applicationId}:recruiter:${input.recipientEmail}`;
}

/**
 * One recipient of one scheduled report period. `periodStart` is the scheduled
 * slot the report was due for, not the tick time, so a retried tick for the
 * same slot does not send again. Each period sends once per recipient.
 */
export function scheduledReportEmailDedupeKey(input: {
  scheduledReportId: string;
  periodStart: Date;
  recipient: string;
}): string {
  return `scheduled-report:${input.scheduledReportId}:${input.periodStart.toISOString()}:${input.recipient}`;
}

/** An offer withdrawal. An offer is withdrawn once, so the offer id names the event. */
export function offerEmailDedupeKey(input: { offerId: string; kind: "withdrawn" }): string {
  return `offer:${input.offerId}:${input.kind}`;
}

/**
 * An offer extension. The same offer with the same terms is one event, so a
 * double send reuses the row. Changed terms get a new key, so a resend after a
 * failure carries the terms the recruiter actually sent.
 */
export function offerExtendedEmailDedupeKey(input: { offerId: string; terms: unknown }): string {
  const fingerprint = createHash("sha256").update(JSON.stringify(input.terms)).digest("hex");
  return `offer:${input.offerId}:extended:${fingerprint}`;
}
