# Visual Automations — PAUSED

The visual workflow automation builder (WHEN → IF → DO) and its engine live
in this directory. The feature is **paused for the current launch** and is
not surfaced anywhere in the product.

## What is hidden

- The sidebar "Automations" nav link — removed from
  `apps/web/src/components/dashboard/nav-items.ts`.
- The "Automations" permission group in the role editor — removed from
  `apps/web/src/features/workspaces/permissions.ts`
  (`PERMISSION_GROUPS`).
- The default `automations:manage` grant for the built-in `recruiter` role
  — removed from `BUILTIN_ROLE_PERMISSIONS`.
- The routes `/dashboard/automations` and `/dashboard/automations/[id]` —
  both files now call `notFound()` so direct URL access returns 404.
- The API key scopes `automations:read` and `automations:write` — filtered
  out of the scopes list passed to the developers settings page.

The `automations:manage` permission key is intentionally kept in the
`PERMISSIONS` type union so the implementation in this directory continues
to type-check. It is not granted to any role by default and is not shown in
the role editor, so no one can acquire it through the UI.

## What stays

All implementation code is preserved verbatim so the feature can be
re-enabled without rebuilding:

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

The dispatcher hook in `apps/web/src/server/webhooks/emit.ts` still runs on
every domain event; it is a silent no-op when no workflows match.

## Why it is paused

The builder is functionally complete but the condition editor is raw
(`<select>` h-8 fields, no field autocomplete, no live validation), the
dry-run is a smoke test against the most recently updated candidate, and
there is no end-user observability for runs. Shipping it now risks bad
first impressions and a disproportionate support burden during the launch
window. See `WORKFLOW_ENGINE_DESIGN.md` at the repo root for the full
design intent and the phased build plan, and the roadmap decision log for
the launch scoping.

## How to re-enable

1. Restore the sidebar item in
   `apps/web/src/components/dashboard/nav-items.ts` — re-add the `Workflow`
   icon to the `lucide-react` import and the Automations object inside
   `workspaceNav` (between `Calendars` and `Templates`).
2. Restore the "Automations" group in
   `apps/web/src/features/workspaces/permissions.ts` — re-add the group to
   `PERMISSION_GROUPS` and the `automations:manage` entry to
   `BUILTIN_ROLE_PERMISSIONS.recruiter`.
3. Restore the route bodies in
   `apps/web/src/app/(dashboard)/dashboard/automations/page.tsx` and
   `apps/web/src/app/(fullscreen)/dashboard/automations/[id]/page.tsx` —
   replace the `notFound()` with the original `requirePagePermission`
   guard plus the data-loading calls.
4. Remove the `automations` filter in
   `apps/web/src/app/(dashboard)/settings/developers/page.tsx` (revert
   `scopes={API_SCOPES.filter(...)}` back to `scopes={[...API_SCOPES]}`).
5. Before opening the feature to end users, finish the polish work called
   out in the original review: rich field discovery in `ConditionPanel`,
   a real dry-run sandbox (pick a candidate and a job, simulate an
   event), and a runs timeline on the workflow cards in
   `AutomationsManager`.
