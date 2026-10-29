# Upgrading to Harly 0.3.0

0.3.0 changes how pipeline stages are modelled, how reports are computed, and
who can see what. Existing installations upgrade in place. Read this page
before upgrading a production installation, and take a database backup first
(see [backups](backups.md)).

## What happens when you upgrade

The container applies six additive migrations (`0153`–`0158`) on start.

| Migration | What it does | Notes |
| --- | --- | --- |
| `0153` | Adds `job_stages.kind` (nullable) and `archived_at`; partial unique indexes on active stages | Additive |
| `0154` | Backfills `kind` | Pass 1 maps the legacy names Applied, Screening, Interview, Offer, Hired, Rejected, Withdrawn (trimmed, case-insensitive). Pass 2 classifies **renamed** stages whose applications all share one terminal status (a stage called "Won" holding only hired applications becomes `hired`). Anything else becomes `custom`. |
| `0155` | Integration health, sample-data tracking, setup checklist state, `cron_runs.error`, `workspace_settings.timezone` | Additive |
| `0156` | Trigram search indexes | Guarded. If `pg_trgm` cannot be created or is in another schema, indexes are skipped with a notice and search still works (slower on very large workspaces). |
| `0157` | Database guard refusing to place an application in an archived stage | Trigger only |
| `0158` | `workspace_settings.gravatar_enabled` (default off) | Additive |

* Migrations wait at most **30 seconds** for a table lock and then fail with a
  readable message instead of blocking traffic. Tune with
  `HARLY_MIGRATION_LOCK_TIMEOUT_MS` (`0` disables the limit).
* A stage whose `kind` is still `NULL` (written by a 0.2.x process during a
  rolling upgrade) is classified by its legacy name at read time, so mixed
  versions keep working.
* Stage names that differ only by case or whitespace (allowed by 0.2.x) are
  left alone. They no longer block unrelated edits; renaming or archiving one
  of them resolves the duplicate.

## Behavior changes you should know about

1. **Gravatar is off.** Candidate pictures are no longer fetched from
   gravatar.com. An owner or admin can re-enable it in *Settings → Company*.
2. **Exports need `dsar:manage`.** The consent report and the audit-log export
   (which also needs `security:manage`) no longer key off the owner/admin role.
   Owners, admins and the default Recruiter role hold `dsar:manage`; custom
   roles must be granted it in *Settings → Roles*. The consent report is
   limited to candidates inside the caller's role scope.
3. **Role scope is enforced everywhere.** Roles limited to specific jobs,
   departments or regions see only in-scope jobs, candidates, applications,
   interviews, pool entries, inbox threads, tasks and documents, in the UI, AI
   tools and AI write actions. **Reports are not available to such roles yet**
   (page, API, AI tool and scheduled reports). A candidate with no application
   is visible to a restricted role only to the user who created it.
4. **Scheduled reports** run only while their creator is still a member with
   `reports:read` and an unrestricted scope; otherwise the run is recorded as
   *skipped* with a reason. A schedule whose creator was deleted stops sending
   until an owner recreates it.
5. **REST API.**
   * Publishable (`pk_`) keys can create applications and read jobs only.
     `move`, `reject`, `hire` and `bulk` require a secret key.
   * Creating a key from the UI requires you to hold the permission behind
     every requested scope.
   * Keys remain workspace-wide and do not follow role scope. See
     [API authorization](../apps/docs/developers/api-authorization.mdx).
6. **Search recents** are stored per user and workspace, expire after 30 days
   and are cleared on sign-out. Existing recents are discarded once.
7. **Email.** Messages the provider accepted are never retried; an SMTP
   timeout or reset after the connection is established is shown as an unknown
   outcome and must be retried manually from the delivery log. Events that were
   already in flight at upgrade time may be delivered once more after a retry
   or redelivery because their older dedupe keys differ.
8. **AI anonymization** now also covers Harly AI chat tool results. Replies
   refer to candidates by a per-conversation pseudonym ("Candidate 7KQ2MX").
9. **Demo instances** must set `DEMO_WORKSPACE_ID` when `DEMO_MODE` is on; the
   reset job refuses to run without it.
10. A hire now withdraws the candidate's other applications through the normal
    withdrawal path (stage history, `application.withdrawn` events, webhooks).

## Known limitations

* **Rollback.** Rolling back to a 0.2.x image is supported only if no stage
  has been archived or reclassified. 0.2.x does not understand archived
  stages, so archived stages would reappear on boards. Restore from backup if
  you must roll back after using the stage editor.
* **Legacy hire dates.** Hires made before 0.3.0 without a stage-history row
  are dated by their last activity event (or `updated_at`). Their dates in
  reports may differ from the real hire date. Hires after the upgrade are
  dated by the transition into the hired stage.
* **Reports for restricted roles** are unavailable (see above).
* **REST API authorization** is intentionally unchanged beyond the items
  above; a hardening plan is described in the API authorization page.
* **Auth screens** (sign in, setup, enter) always use the light theme.
* The Zoom refresh token is kept in process memory if the database write fails
  after a rotation; a restart before the next successful write requires
  reconnecting Zoom.

## After upgrading

1. Open *Settings → Integrations* and review any connection reported as
   *needs reconnect* or *degraded*.
2. Open a job's pipeline and use **Edit stages** to confirm your stage kinds
   (especially custom-named hired/rejected stages).
3. Review *Settings → Roles* and grant `dsar:manage` where needed.
4. Check the delivery log for messages marked unknown outcome.
5. Run `harly doctor` to confirm the scheduler and migrations are healthy.
