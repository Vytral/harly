# Visual Automations

The visual workflow automation builder (WHEN → IF → DO) and its engine live
in this directory. The creator UI is currently disabled and not surfaced in the
product; the engine and API remain available for controlled backend use.

## Where it lives

- The creator routes are intentionally disabled with `notFound()`:
  `/dashboard/automations` and `/dashboard/automations/[id]`.
- Existing automation permissions, routes, and API contracts are retained only
  for compatibility with stored data; they are not granted, registered, or
  reachable while the kill switch is off.

## What's here

- `schema.ts` — Zod schemas for triggers, conditions, and actions.
- `engine.ts`, `conditions.ts`, `dispatch.ts` — the evaluator and
  event-driven dispatcher (with anti-loop protection).
- `data.ts`, `actions.ts` — workspace-scoped CRUD and server actions.
- `registry.ts` — the shared action catalog (also consumed by the AI
  agent).
- `builder/` — the WHEN / IF / DO React components and the focus-mode
  builder shell.
- `AutomationsManager.tsx` — the index grid with template gallery and
  dry-run entry point.
- `templates.ts`, `preview.ts`, `catalog.ts` — starter content, the
  natural-language preview, and the field/operator metadata.
- The REST API at `apps/web/src/app/api/v1/automations/` is currently disabled
  and returns `410 Gone`.
- Every `*.test.ts` file in this directory and its `builder/` subfolder.
- The `workflow_definitions`, `workflow_runs`, and `workflow_run_steps`
  tables in `packages/db/src/schema.ts`.

The dispatcher hook in `apps/web/src/server/webhooks/emit.ts` remains wired for
safe re-enablement, but is currently a silent no-op behind the feature kill
switch.

## Known open items

The dry-run is a smoke test against the most recently updated candidate
(picks a real candidate + their latest application; no picker to choose a
specific one). There is no end-user observability for runs beyond the
per-workflow API run history — no runs timeline on the workflow cards in
`AutomationsManager` yet. See `WORKFLOW_ENGINE_DESIGN.md` at the repo root
for the full design intent and the phased build plan.
