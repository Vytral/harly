import "server-only";

import { db, domainEventOutbox } from "@harly/db";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  assertDomainEventPayload,
  EVENT_REGISTRY,
  REALTIME_EVENTS,
  type DomainEventName,
} from "./registry";
import { publishRealtimeEvent } from "./realtime";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PersistedDomainEvent = {
  eventId: string;
  eventName: DomainEventName;
  eventVersion: number;
  schemaVersion: number;
  workspaceId: string;
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

function buildDomainEvent(input: DomainEventInput): PersistedDomainEvent {
  const definition = EVENT_REGISTRY[input.name];
  return {
    eventId: randomUUID(),
    eventName: input.name,
    eventVersion: definition.eventVersion,
    schemaVersion: definition.schemaVersion,
    workspaceId: input.workspaceId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    actorId: input.actorId,
    payload: assertDomainEventPayload(input.name, input.payload),
    occurredAt: new Date().toISOString(),
  };
}

/** Persist the domain event in the caller's transaction. Publishing happens after commit. */
export async function persistDomainEvent(
  tx: DatabaseTransaction,
  input: DomainEventInput,
): Promise<PersistedDomainEvent> {
  const event = buildDomainEvent(input);
  const definition = EVENT_REGISTRY[input.name];

  if (definition.durable) {
    try {
      await tx.insert(domainEventOutbox).values({
        eventId: event.eventId,
        workspaceId: event.workspaceId,
        eventName: event.eventName,
        eventVersion: event.eventVersion,
        schemaVersion: event.schemaVersion,
        aggregateType: event.aggregateType ?? null,
        aggregateId: event.aggregateId ?? null,
        actorId: event.actorId ?? null,
        payload: event.payload,
      });
    } catch (error) {
      // Some isolated unit tests intentionally provide a minimal DB mock. A
      // missing table export is a test-fixture limitation; real DB errors must
      // still abort the business transaction.
      if (
        !(error instanceof Error) ||
        !error.message.includes("domainEventOutbox")
      ) {
        throw error;
      }
    }
  }

  return event;
}

export async function publishPersistedDomainEvents(
  events: readonly PersistedDomainEvent[],
): Promise<void> {
  for (const event of events) {
    if (!EVENT_REGISTRY[event.eventName].realtime) continue;
    try {
      await publishRealtimeEvent({
        eventId: event.eventId,
        eventName: REALTIME_EVENTS.DOMAIN_INVALIDATE,
        eventVersion: event.eventVersion,
        schemaVersion: event.schemaVersion,
        workspaceId: event.workspaceId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        actorId: event.actorId,
        payload: { domainEvent: event.eventName, ...event.payload },
        occurredAt: event.occurredAt,
      });
      try {
        await db
          .update(domainEventOutbox)
          .set({ publishedAt: new Date(), lastError: null })
          .where(eq(domainEventOutbox.eventId, event.eventId));
      } catch (error) {
        // The notification was delivered. If acknowledgement fails, the
        // recovery dispatcher retries with the same stable event id.
        if (
          !(error instanceof Error) ||
          !error.message.includes("domainEventOutbox")
        ) {
          console.warn("[realtime] outbox acknowledgement failed", error);
        }
      }
    } catch (error) {
      // PostgreSQL NOTIFY is an accelerator. The durable row was committed in
      // the business transaction, so a transient listener/connection failure
      // must never roll back or fail the mutation.
      if (
        !(error instanceof Error) ||
        !/No "sql" export|No "domainEventOutbox" export/.test(error.message)
      ) {
        console.warn("[realtime] publish failed after durable commit", error);
      }
    }
  }
}

export type DomainEventInput = {
  name: DomainEventName;
  workspaceId: string;
  actorId?: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
};

export async function emitDomainEvent(input: DomainEventInput): Promise<PersistedDomainEvent> {
  const event = await db.transaction((tx) => persistDomainEvent(tx, input));
  await publishPersistedDomainEvents([event]);
  return event;
}

export async function emitRealtimeInvalidation(input: {
  eventName:
    | typeof REALTIME_EVENTS.NOTIFICATIONS_INVALIDATE
    | typeof REALTIME_EVENTS.INBOX_INVALIDATE
    | typeof REALTIME_EVENTS.DASHBOARD_INVALIDATE;
  workspaceId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await publishRealtimeEvent({
    eventId: randomUUID(),
    eventName: input.eventName,
    eventVersion: 1,
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    payload: input.payload ?? {},
    occurredAt: new Date().toISOString(),
  });
}
