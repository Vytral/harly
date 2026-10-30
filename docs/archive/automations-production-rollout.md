# Automations v2 production rollout

This runbook is the release gate for the durable graph runtime. It is intentionally separate from local verification: the production database must be selected explicitly by the deployment system and must never be inferred from a developer shell.

## Scope

New workflows launch directly on the v2 graph runtime. This runbook does not
require bulk conversion of v1 definitions or runs. The historical v1 runner is
kept only for any existing installation data discovered during rollout; if an
operator needs to drain it, use the explicitly named `AUTOMATIONS_DISABLE_V1_DISPATCH`
switch and handle those historical definitions separately.

This release includes:

- immutable workflow graphs and published versions;
- productive v2 execution through the fenced worker;
- durable node attempts, retries, heartbeats, stale-worker reconciliation, and `uncertain` outcomes;
- delay, approval, event, document-package, and signature waits;
- durable email/outbox, document, interview, offer, stage, task, chat, and HTTP actions;
- dedicated `/api/cron/automations` scheduling;
- graph-aware, effect-free test simulation.

AI decision actions remain unavailable until their audit, rate-limit, human-review, and durable execution contract is implemented. They must not be enabled by editing the catalog alone.

## Preconditions

1. Build the exact commit to deploy and record its SHA.
2. Confirm `CRON_SECRET` is present and different from development values.
3. Confirm the scheduler invokes all required routes with `Authorization: Bearer $CRON_SECRET`:
   - `/api/cron/domain-events` every 15 seconds;

- `/api/cron/automations` every 10 seconds where supported, or every 60 seconds as the declared fallback;
  - `/api/cron/webhooks/dispatch` every 60 seconds;
  - `/api/cron/email-outbox` every 60 seconds;
  - `/api/cron/esign-reconciliation` and `/api/cron/document-expiry` on their existing schedules;
  - `/api/cron/esign-reminders` every 60 minutes for native signing recipients.

4. Take a database backup and verify that it can be restored in a non-production environment.
5. Confirm the release has passed the isolated database integration suite. Do not use the primary database for that check.

## Database migration

Apply migrations through the repository migration runner, in order. The current automations release adds the append-only migrations `0143` through `0156`.

```sh
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm --filter @harly/db db:migrate
```

Never run `db:push`, edit an applied migration, delete a journal entry, or manually mark a migration as applied. If the migration fails, stop the rollout, preserve the error and transaction state, and restore or repair through the database team’s normal procedure.

After the application is deployed, verify from a read-only connection:

```sql
select max(id) as latest_migration from drizzle.__drizzle_migrations;
select count(*) from workflow_definition_versions where schema_version = 2;
select count(*) from workflow_runs where engine_version = 2;
```

The first query is deployment-specific because Drizzle’s ledger representation can vary. The expected result is that every migration in the release is recorded and the two workflow queries return valid rows or zero rows without an error.

The runtime `doctor` command also checks the v2 relation set and the durable
worker columns (`engine_version`, `logical_status`, and wait resource metadata),
not just the generic deployment bootstrap marker. A green bootstrap marker by
itself is not sufficient evidence that the automations release was migrated.

## Application rollout

1. Deploy the reader/services that execute v2 and can still read historical v1 data.
2. Deploy the worker and cron route.
3. Deploy the builder UI.
4. Confirm new definitions are created as v2 and new published graph versions select v2 explicitly. Do not make a bulk v1-run migration a release prerequisite; historical v1 data remains readable through the compatibility path.
5. Treat CLI installation telemetry as a separate product/measurement change, not as a gate for launching v2 and not as a reason to backfill or migrate historical automation runs.
6. Enable automations for one internal workspace or canary tenant.
7. Create one canary workflow containing a harmless note/task action, publish it, emit one matching event, and verify exactly one run and one node effect.
8. Exercise one delay or approval wait and verify the run is `waiting`, the lease is released, and the resolver resumes it exactly once.
9. Exercise one retryable provider error and verify the run enters `retrying` with a future `next_attempt_at`, then succeeds after the provider recovers.
10. Expand the canary gradually after observing the metrics below. The legacy
    drain switch is not part of the v2 launch gate: the builder does not create v1
    definitions, while historical v1 records remain available for read/support
    operations. If an old v1 workflow is discovered, pause or handle it explicitly
    instead of silently converting its run state.

## Required observability

Monitor for at least one normal scheduler interval plus the longest canary wait:

- automation cron success/failure and duration;
- due queue depth and oldest due run age;
- claim conflicts and lease expirations;
- retries by action type and final `dead_letter` count;
- workflow node attempts by `action_type` and result, including aggregate action duration;
- `uncertain` outcomes;
- native signature reminder cron success/failure and outbox backlog;
- waiting runs by `waitingKind`;
- event waits recovered from the domain-event outbox cursor (`eventWaitsReconciled`);
- domain-event outbox age and webhook/chat delivery failures;
- duplicate-effect attempts by `effectKey`.

Do not use candidate IDs, email addresses, document contents, secrets, or raw provider payloads as metric labels.

Minimum alert policy before widening the canary:

- page when `harly_workflow_uncertain_nodes > 0` for two consecutive scrapes;
- page when `harly_workflow_runs_stale > 0` for two scheduler intervals;
- warn when due runs are older than two scheduler intervals or when retrying/dead-letter counts grow in three consecutive intervals;
- warn when the action-duration p95 is above the configured provider timeout for ten minutes;
- page on two consecutive failed automation-cron runs.

The in-process counters are diagnostic and may reset on a deploy; queue, run,
wait, stale and uncertain gauges are read from PostgreSQL and are the release
decision signals. Production dashboards must aggregate the endpoint across all
web/worker instances.

## Rollback

Rollback the application image or feature flag, not the database schema. Keep the migration expanded so readers and recovery workers can continue to inspect v2 rows. A flag rollback must not stop recovery of already-created v2 runs.

If a provider result is ambiguous, do not blindly retry it. Leave the node `uncertain`, reconcile using the provider’s idempotency key or a verified provider lookup, and use the run-history reconciliation control to record the result, note, and optional provider reference/payload. That control resumes v2 from persisted evidence without invoking the provider again; replay is reserved for a separately approved new effect.

After rollback, verify that:

- no v2 run is silently being sent to the v1 engine;
- waiting runs retain their resolver metadata;
- published versions remain immutable;
- the automation scheduler is still running, even if new workflow entry is disabled.

## Completion evidence

The release owner records the deployed SHA, migration result, canary workflow/run IDs, scheduler response counters, retry/wait evidence, and the observation window. “The page loaded” is not sufficient evidence for a production rollout.
