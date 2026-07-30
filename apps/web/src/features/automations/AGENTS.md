# Visual Automations

The visual workflow automation builder (WHEN → IF → DO) and its engine live
in this directory. It is enabled and surfaced in the product.

## Where it lives

- The sidebar "Automations" nav link — `apps/web/src/components/dashboard/nav-items.ts`,
  in the "Set up" group (`moreNav`), gated on `automations:manage`.
- The "Automations" permission group in the role editor —
  `apps/web/src/features/workspaces/permissions.ts` (`PERMISSION_GROUPS`),
  with `automations:manage` granted by default to the built-in `recruiter`
  role (`BUILTIN_ROLE_PERMISSIONS`).
- The routes `/dashboard/automations` (index/grid) and
  `/dashboard/automations/[id]` (fullscreen builder).
- The API key scopes `automations:read` and `automations:write` — included
  in the scopes list on the developers settings page.

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
- The REST API at `apps/web/src/app/api/v1/automations/` — list, create,
  read, update, delete, and run history.
- Every `*.test.ts` file in this directory and its `builder/` subfolder.
- The `workflow_definitions`, `workflow_runs`, and `workflow_run_steps`
  tables in `packages/db/src/schema.ts`.

The dispatcher hook in `apps/web/src/server/webhooks/emit.ts` runs on every
domain event; it is a silent no-op when no workflows match.

## Known open items

The dry-run is a smoke test against the most recently updated candidate
(picks a real candidate + their latest application; no picker to choose a
specific one). There is no end-user observability for runs beyond the
per-workflow API run history — no runs timeline on the workflow cards in
`AutomationsManager` yet. See `WORKFLOW_ENGINE_DESIGN.md` at the repo root
for the full design intent and the phased build plan.
