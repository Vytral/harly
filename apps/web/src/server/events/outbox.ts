import "server-only";

import { db, domainEventOutbox } from "@harly/db";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

import {
  EVENT_REGISTRY,
  REALTIME_EVENTS,
  type DomainEventName,
} from "./registry";
import { publishRealtimeEvent } from "./realtime";

/** Keep the durable domain log bounded. Realtime delivery is ephemeral and
 * does not depend on these rows, so retention can be conservative and simple. */
export async function pruneDomainEventOutbox(
  retentionDays = 7,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
  const deleted = await db
    .delete(domainEventOutbox)
    .where(lt(domainEventOutbox.createdAt, cutoff))
    .returning({ id: domainEventOutbox.id });
  return deleted.length;
}

/**
 * Republishes committed events whose fast PostgreSQL NOTIFY acknowledgement
 * was lost during a process, proxy, or database failure. Delivery is
 * intentionally at-least-once; the persisted event id is stable and clients
 * deduplicate it safely.
 */
export async function dispatchDomainEventOutbox(batchSize = 100): Promise<{
  published: number;
  failed: number;
}> {
  const pending = await db
    .select()
    .from(domainEventOutbox)
    .where(isNull(domainEventOutbox.publishedAt))
    .orderBy(asc(domainEventOutbox.createdAt))
    .limit(batchSize);

  let published = 0;
  let failed = 0;
  for (const row of pending) {
    const eventName = row.eventName as DomainEventName;
    const definition = EVENT_REGISTRY[eventName];
    try {
      if (definition?.realtime) {
        await publishRealtimeEvent({
          eventId: row.eventId,
          eventName: REALTIME_EVENTS.DOMAIN_INVALIDATE,
          eventVersion: row.eventVersion,
          schemaVersion: row.schemaVersion,
          workspaceId: row.workspaceId,
          aggregateType: row.aggregateType ?? undefined,
          aggregateId: row.aggregateId ?? undefined,
          actorId: row.actorId ?? undefined,
          payload: {
            domainEvent: row.eventName,
            ...(row.payload as Record<string, unknown>),
          },
          occurredAt: row.createdAt.toISOString(),
        });
      }
      await db
        .update(domainEventOutbox)
        .set({ publishedAt: new Date(), lastError: null })
        .where(
          and(
            eq(domainEventOutbox.id, row.id),
            isNull(domainEventOutbox.publishedAt),
          ),
        );
      published += 1;
    } catch (error) {
      failed += 1;
      await db
        .update(domainEventOutbox)
        .set({
          attempts: row.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(domainEventOutbox.id, row.id));
    }
  }
  return { published, failed };
}
