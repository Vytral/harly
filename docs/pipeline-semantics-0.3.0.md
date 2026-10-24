# 0.3.0: per-job pipeline semantics

Planning only. Implement on a separate branch after 0.2.2; no schema or behavior
change is included here. A stage's name becomes a display label, while its
stable meaning controls outcomes and reporting.

## Current name dependencies

| Path under `apps/web/src/features/` | Current dependency | Replacement |
| --- | --- | --- |
| `reports/data.ts` — `getHiringEvents`, `countHiringEvents` | Both join history to `lower(trim(job_stages.name)) = 'hired'`; funnel also assumes five canonical names. | Canonical semantic hiring events; define per-job and aggregate funnel behavior explicitly. |
| `offers/service.ts`, `offers/actions.ts` | Accepted offers locate the target stage with `lower(name) = 'hired'`. | Select the job's semantic `hired` stage; preserve the explicit hired outcome if none is configured. |
| `pipeline/state.ts`, `pipeline/actions.ts`, `applications/service.ts` | Convert literal Hired/Rejected/Withdrawn names to statuses and reverse statuses into name lookups. `pipeline/data.ts` uses that classification for next-stage behavior. | One shared semantic resolver for individual, bulk, API and status actions. |
| `dashboard/widgets.ts` | Screening/Interview/Offer/Hired name predicates and name-based follow-up heuristics. | Query semantic keys; continue displaying labels. |
| `jobs/service.ts`, `jobs/data.ts`, `candidates/CandidateActionBar.tsx` | Default names and interview/offer/hire label heuristics. | Seed explicit keys; derive suggested actions from keys. |

Portal progress already uses stage IDs and application status: retain that
contract and display the current label. AI reporting uses shared hiring-event
helpers, so update those helpers rather than adding an AI-specific definition.
Existing automation `stageName` conditions must retain literal-name behavior.

## Migration and rollout

1. Add `job_stages.semantic_key` with a constrained vocabulary: `applied`,
   `screening`, `interview`, `offer`, `hired`, `rejected`, `withdrawn`, `custom`.
   Add an immutable transition semantic snapshot where history needs it, so
   later metadata edits cannot rewrite historical hiring totals. Generate
   append-only Drizzle migrations, snapshots and journal entries together.
2. Backfill only exact case/space-normalized canonical labels. Keep other
   labels `custom`; report ambiguous stages and status/stage conflicts for owner
   mapping. Do not infer meanings from order, color or application status.
   Preserve IDs, labels, history and explicit hired/rejected outcomes. Audit
   duplicate terminal meanings before enforcing uniqueness per job.
3. Deploy additive metadata and compatibility reads first, then migrate the
   queries above. Keep application status authoritative for explicit decisions.
   Lock semantic meaning once used, or require an explicit audited migration;
   retire referenced stages instead of deleting history. Reconcile ambiguous
   records before removing the legacy-name fallback.
4. Keep REST status strings and stage IDs stable. Add semantic fields to API
   and events; preserve display-name payloads and existing automation filters.
   Add semantic automation conditions separately. Offer acceptance must never
   guess a target from its label or position.

## Completion gate

Rename/translate/reorder stages without changing hiring totals; test custom
stages, ambiguous backfill, accepted offers, bulk/API decisions, portal progress,
legacy webhooks/automation conditions and AI report answers. Verify upgrade and
recovery on a disposable copy before enabling configurable pipelines by default.
