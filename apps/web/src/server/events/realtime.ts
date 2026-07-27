import "server-only";

import { sql } from "@harly/db";

import type { RealtimeEventName } from "./registry";

export type RealtimeEnvelope = {
  eventId: string;
  eventName: RealtimeEventName;
  eventVersion: number;
  schemaVersion: number;
  workspaceId: string;
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

type Subscriber = (event: RealtimeEnvelope) => void;

type RealtimeState = {
  subscribers: Map<string, Set<Subscriber>>;
  listenerPromise?: Promise<void>;
};

declare global {
  var harlyRealtime: RealtimeState | undefined;
}

const state: RealtimeState = globalThis.harlyRealtime ?? {
  subscribers: new Map(),
};

if (process.env.NODE_ENV !== "production") {
  globalThis.harlyRealtime = state;
}

function parseEnvelope(payload: string): RealtimeEnvelope | null {
  try {
    const value = JSON.parse(payload) as RealtimeEnvelope;
    if (
      !value ||
      typeof value.eventId !== "string" ||
      typeof value.eventName !== "string" ||
      typeof value.workspaceId !== "string" ||
      !value.payload ||
      typeof value.payload !== "object"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function broadcast(event: RealtimeEnvelope) {
  for (const subscriber of state.subscribers.get(event.workspaceId) ?? []) {
    try {
      subscriber(event);
    } catch {
      // A broken client stream must not break delivery to other subscribers.
    }
  }
}

export async function ensureRealtimeListener(): Promise<void> {
  if (state.listenerPromise) return state.listenerPromise;

  state.listenerPromise = sql
    .listen("harly_realtime", (payload: string) => {
      const event = parseEnvelope(payload);
      if (event) broadcast(event);
    })
    .then(() => undefined)
    .catch((error) => {
      state.listenerPromise = undefined;
      throw error;
    });

  return state.listenerPromise;
}

export function subscribeRealtime(workspaceId: string, subscriber: Subscriber) {
  const subscribers = state.subscribers.get(workspaceId) ?? new Set();
  subscribers.add(subscriber);
  state.subscribers.set(workspaceId, subscribers);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) state.subscribers.delete(workspaceId);
  };
}

export async function publishRealtimeEvent(
  event: RealtimeEnvelope,
): Promise<void> {
  const payload = JSON.stringify(event);
  if (Buffer.byteLength(payload, "utf8") > 7_500) {
    throw new Error("Realtime event payload exceeds PostgreSQL NOTIFY limit.");
  }

  await sql`select pg_notify('harly_realtime', ${payload})`;
}

export function formatSseEvent(event: RealtimeEnvelope): string {
  return `id: ${event.eventId}\nevent: ${event.eventName}\ndata: ${JSON.stringify(event)}\n\n`;
}
