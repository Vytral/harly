import { describe, expect, it } from "vitest";

import {
  DOMAIN_EVENTS,
  EVENT_REGISTRY,
  REALTIME_EVENTS,
  assertDomainEventPayload,
  isDomainEventName,
} from "./registry";

describe("domain event registry", () => {
  it("keeps event names centralized and versioned", () => {
    expect(DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED).toBe(
      "application.stage_changed",
    );
    expect(
      EVENT_REGISTRY[DOMAIN_EVENTS.APPLICATION_STAGE_CHANGED],
    ).toMatchObject({
      eventVersion: 1,
      schemaVersion: 1,
      durable: true,
      realtime: true,
    });
    expect(REALTIME_EVENTS.NOTIFICATIONS_INVALIDATE).toBe(
      "notifications.invalidate",
    );
  });

  it("validates payloads before publication", () => {
    expect(
      assertDomainEventPayload(DOMAIN_EVENTS.CANDIDATE_CREATED, {
        candidate: { id: "candidate-1" },
      }),
    ).toEqual({ candidate: { id: "candidate-1" } });
    expect(() =>
      assertDomainEventPayload(DOMAIN_EVENTS.CANDIDATE_CREATED, {
        candidateId: "candidate-1",
      }),
    ).toThrow();
    expect(isDomainEventName("not-a-domain-event")).toBe(false);
  });
});
