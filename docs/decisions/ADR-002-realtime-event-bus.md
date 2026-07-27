# ADR-002: PostgreSQL-backed domain events with SSE realtime delivery

## Status

Accepted

## Context

Harly's dashboard currently relies on Server Component refreshes and a 30-second
notification poll. ATS users need changes made by another teammate to appear
without manually refreshing, while PostgreSQL must remain the source of truth.

The system already has domain-shaped webhook events, a persistent scheduler,
and durable delivery patterns. It does not currently require Redis or a
separate realtime service.

## Decision

Use a typed, versioned domain-event registry with separate delivery policies:

- Durable business events are recorded in `domain_event_outbox`.
- Ephemeral UI invalidations are delivered through PostgreSQL `LISTEN/NOTIFY`.
- The browser receives events through Server-Sent Events at `/api/realtime`.
- Missed realtime messages are recovered by refetching authoritative data; the
  realtime stream is never treated as a durable source of truth.
- The SSE endpoint initially runs inside the existing web process.

## Rationale

SSE matches Harly's server-to-browser event flow and is simpler than WebSockets.
PostgreSQL avoids a new infrastructure dependency while supporting the current
single-instance and small multi-process deployment model. Separating durable
domain events from ephemeral UI messages prevents view/presence events from
polluting audit and integration queues.

## Consequences

### Positive

- Changes become visible without full browser reloads.
- Durable events survive application restarts.
- Event payloads are centrally versioned and validated.
- Redis or a dedicated realtime process can be introduced behind the same bus
  abstraction later.

### Negative

- PostgreSQL connections are held for `LISTEN` while web processes run.
- Existing Server Component screens initially use a coalesced route refresh
  until they adopt query-level invalidation.
- `NOTIFY` payloads must remain small and are not replayable.

### Risks and mitigations

- Lost notification → authoritative refetch on reconnect or event gap.
- Workspace data leakage → workspace resolved server-side and enforced per SSE
  subscription.
- Refresh storm → client deduplication and 100ms coalescing window.
- Event contract drift → registry, payload validation, and explicit versions.

## Date

2026-07-26
