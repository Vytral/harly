# Candidate deletion operations

Candidate deletion is a durable, workspace-scoped purge. A request creates a
`candidate_deletion_jobs` row and the scheduler retries it until it completes,
is blocked by a legal hold, or reaches the dead-letter limit.

## Job lifecycle

```text
pending -> processing -> completed
                    \\-> failed -> processing
                    \\-> blocked
                    \\-> dead_letter
```

Workers claim rows with `FOR UPDATE SKIP LOCKED`. A stale processing lock is
reclaimable after ten minutes; the old worker cannot later overwrite the state
because completion/failure updates are owner-checked. Failed jobs use bounded
exponential backoff and are dead-lettered after eight attempts. Requeueing the
same candidate or DSAR request is idempotent.

The purge fails closed when an owned storage object, interview provider, or
external signature submission cannot be removed. The candidate remains in the
trash and the job is retried; a successful retry treats already-removed remote
resources as idempotent success.

## Legal holds

An active document legal hold blocks the purge before database deletion. DSAR
requests are marked `blocked` with the reason, responsible operator, block time,
and a 30-day review deadline. Once the hold is released, the operator can retry
the same request without creating a duplicate job.

Blocked, failed, and dead-letter jobs can be manually replayed with the
workspace-scoped `requeueCandidateDeletionJob` application operation after the
underlying hold, storage, database, or provider issue has been fixed. Manual
replay resets the retry budget and remains auditable through the requested-by
field.

## Reconciliation

`POST /api/cron/candidate-reconciliation` is report-only by default. It reports
soft-deleted candidates with remaining relations and unreferenced candidate or
mail storage keys. A controlled request with `{ "dryRun": false }` only queues
idempotent purge jobs; the deletion worker performs the destructive operation.

The bundled scheduler runs reconciliation daily and candidate deletion every
minute. Do not delete rows or objects manually; inspect the job error, legal
hold, storage, or provider condition and retry through the application.

## Observability

Prometheus exposes pending, processing, failed, blocked, dead-letter, and stale
deletion jobs under `harly_candidate_deletion_jobs`. Alert rules cover failures,
legal holds, dead letters, and stale workers. Operational metrics expose job
counts by status. Completed jobs retain deletion statistics and duration, while
audit events retain the actor and critical deletion action.

## Verification

The purge integration suite covers direct and indirect candidate data, legacy
mail, portal tokens, documents and versions, storage failure, database failure,
legal holds, workspace isolation, and concurrent purges. Run it against a
disposable local database with:

```sh
RUN_CANDIDATE_DELETION_INTEGRATION=1 pnpm --filter web test -- \
  src/features/candidates/candidate-deletion.integration.test.ts
```
