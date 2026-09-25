# ADR-006: Automations v2 — PostgreSQL durable graph runtime

## Status

Accepted — implemented incrementally in Automations v2

This decision is the architectural baseline for
`docs/automations-product-plan.md`. The durable graph runtime, builder contract,
waits, approvals, document/signature continuation, real action adapters and
scheduler wiring are implemented in this worktree. Remaining release gates are
tracked in `docs/automations-production-rollout.md`; production schema
migration and canary execution require an explicitly authorized production
environment and are not performed from a developer shell.

## Context

Harly already runs a v1 automation engine: WHEN (one event) → IF (condition
tree) → THEN (ordered actions). Definitions, versions, runs, steps, and effect
keys live in PostgreSQL. Dispatch uses the domain-event outbox (ADR-002). The
engine leases runs, heartbeats, and retries. Action handlers call existing
ATS services with an explicit actor, not a second copy of hiring logic.

That model cannot express the product we need: a recruiter-built process that
waits until the next morning, asks a human to approve, generates documents,
collects signatures in the portal, and only then moves the application. v1 has
no wait table, no in-run approval, no graph ports, and no draft that can be
edited while a published version keeps running. `updateWorkflow` writes the
same `workflow_definitions` row back to `draft` and clears publication fields,
so saving interrupts the live process.

A separate orchestrator (Temporal, Redis, BullMQ) would split durability away
from the source of truth ADR-002 already chose. The canvas library is a
presentation concern; execution order must come from a compiled graph, not
from node coordinates.

## Decision

Build automations v2 on PostgreSQL, with a directed acyclic graph as the
definition and a single active token per run.

1. **Durable runtime in Postgres.** Runs, node executions, attempts, waits,
   approvals, event receipts, and effect keys are rows. Workers claim with
   short transactions and `FOR UPDATE SKIP LOCKED` (or equivalent CAS). A wait
   releases the worker. SSE invalidates views; it is never the wait mechanism.
2. **Graph, not a freeform program.** One trigger. Exclusive branches may
   converge. No cycles, no user JavaScript, no parallel joins in the first
   launch. Layout coordinates are presentation-only and excluded from the
   semantic hash.
3. **Draft is not published.** A draft revision can be incomplete. Publishing
   validates a specific revision (CAS / `expectedRevision`) and points the
   live workflow at an immutable version. Editing a draft must not stop
   in-flight runs of the published version.
4. **Tools are adapters.** Each selectable tool has a client-safe catalog
   entry, a versioned input/output contract, a server handler, reference
   validation, a simulation fixture, and permission checks. Handlers receive
   workspaceId, actorId, run/node/attempt ids, effectKey, and AbortSignal.
   They reuse Harly domain services. They do not read cookies.
5. **Canvas is React Flow + ELK.** `@xyflow/react` renders the graph; `elkjs`
   auto-layouts on demand. The editor reducer owns the definition; React Flow
   objects are not persisted as domain state.
6. **Causality over time-window anti-loops.** Deduplicate by `eventId` /
   `sourceEventId`. Propagate causationId, rootRunId, and depth. Do not treat
   “same candidate within 30 seconds” as identity.
7. **Human decisions are two different objects.** Approving a workflow version
   for publication is not the same as approving a step inside a run.
8. **ADR-005 still holds.** A score must not reject an applicant. Templates
   that would auto-reject from an evaluation remain blocked at runtime.

New definitions and published versions use v2 from their first draft. The v1
runner remains only as a compatibility path for any historical definitions or
runs that may be discovered; no bulk conversion of v1 data or in-flight step
indexes is required for the v2 launch.

## Schema and migration direction

P03 shipped the definition subset additively. P06/P07/P10/P11 shipped the
runtime, wait, approval, document-package, template and execution-evidence
tables through append-only migrations 0143–0155. The repository schema,
migration journal and snapshots are the source of truth. Local development and
isolated verification databases have been migrated; production remains a
deployment gate described in the rollout runbook.

- `workflow_definitions`: `engine_version` default 1, `published_version_id`
  (nullable uuid, indexed, no circular FK), `trigger_generation` default 0,
  `archived_at`. Legacy trigger/conditions/actions remain the live snapshot
  the v1 dispatcher reads.
- `workflow_drafts`: unique `workflow_id`, CAS `revision`, `graph`, `layout`,
  `content_hash`, `review_hash`, `validation_issues`, workspace FK.
- `workflow_definition_versions`: `schema_version`, `graph`, `compiler_version`,
  `content_hash`, `layout_snapshot`. Rows are inserted on publish only.

Lazy backfill: `ensureDraftRow` creates a draft from legacy columns when missing.
Do not convert in-flight v1 runs.

The v2 cursor/lease fields, node executions, waits, approvals, event receipts
and simulation contracts are implemented in the current schema and runtime.

### P06–P12 persistence increment — 2026-09-11

The append-only migrations 0143–0155 add engine selection, immutable version
references, logical run state, database-clock leases, fencing, durable
cursor/context, node executions, attempt evidence, waits, approvals, document
packages/templates and related tenant indexes/foreign keys. Engine version
defaults to 1 so historical rows retain their meaning; new definitions and runs
explicitly select v2. A v2 run cannot be claimed by the historical linear runner.

The migration chain was applied successfully to isolated local verification
databases, followed by a second generation/check with no schema drift. The
PostgreSQL integration suite currently passes 34/34 scenarios, including
concurrent claim fencing, expiry/reclaim, cancellation, durable waits,
approval deadlines, restart recovery, reassignment with vote invalidation,
document/signature continuation, effect reservation, real registry execution,
and durable application status transitions. No production migration or
migration-ledger rewrite has been performed.

### Migration ledger and lease invariant

Any pre-existing production ledger discrepancy must be audited read-only before
deployment; it is never permission to delete or rewrite historical rows. The
deployment must preserve both histories and resolve numbering or snapshot
conflicts explicitly. No production database changes have been made from this
worktree.

`runtime/leases.ts` now implements database-clock claims, 60-second leases,
monotonic fences, renewal and release using CAS. Claims require a published v2
version belonging to the same workflow and workspace. Every renewal/release
requires a live fence, matching worker, running v2 status and no cancellation.

Fixtures are uniquely identified and removed after testing. The integration
suite requires `AUTOMATIONS_TEST_DATABASE_URL` to point to an isolated localhost
database named `harly_automations_verify_*`; it refuses ordinary database names.
The suite verifies durable state transitions and effect reservation. Arbitrary
external providers still use the explicit `uncertain` contract rather than an
unprovable exactly-once claim.

Do not copy PDFs or secrets into JSONB. Bindings store ids; large outputs
reference existing document/storage rows. Composite/workspace FKs must prove
`resourceId` belongs to the same workspace.

`document_packages` is **not** created until P10 confirms no equivalent entity
(P01 found none). Membership “team” today is a text field on `member` plus
`job_hiring_team`; there is no team directory with membership. Approval
selectors in P08 start with concrete users until that domain exists.

## Retention

`pruneDomainEventOutbox` currently deletes rows older than seven days when
`automations_dispatched_at` is null **or** the event is not a workflow
trigger. v2 retention must keep events that still have pending consumers or
reconcile against domain state + wait subscriptions. Do not delete
undispatched work because a time window elapsed.

## Consequences

### Positive

- Waits survive process restarts without holding HTTP or workers.
- Recruiter editing does not collide with executions already in flight.
- A new tool can be added through the catalog/handler contract without
  rewriting the canvas.
- Operations stay inside the existing scheduler and Postgres deployment.

### Negative

- Two engines coexist until v1 drains.
- Graph validation, compilation, and fencing are more code than a linear
  action list.
- Exactly-once delivery is not promised for arbitrary HTTP providers;
  idempotent effect keys plus an `uncertain` state are the contract.

### Risks and mitigations

- Double effects → reserve `effectKey` before the side effect; fence on lease
  token; providers must also key off the same id.
- Lost wake-ups → wait registration + immediate reconcile + periodic
  reconcilers; receipts unique per consumer/event/destination.
- Scope leak → ADR-003 resource guards on selector, run, and tool; workflow
  ownership does not grant all jobs.
- Draft/published races → CAS on draft revision; publish the hashed revision
  that was approved.

## Date

2026-09-06
