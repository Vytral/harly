# Database & Migrations — rules

Drizzle ORM + drizzle-kit. Schema source of truth: `src/schema.ts`. Migrations: `migrations/*.sql` + `migrations/meta/`. Tracking table: `drizzle.__drizzle_migrations` in Postgres.

## The golden rule

**Three things must always agree: `migrations/*.sql` files ↔ `migrations/meta/_journal.json` ↔ DB table `drizzle.__drizzle_migrations`.** Count of `.sql` files = count of journal entries = count of table rows. If they ever diverge, `drizzle-kit migrate` either silently does nothing or crashes looking for a missing file. Most incidents trace back to one of these three drifting from the others.

## How the migration flow works (understand before touching)

1. Edit `src/schema.ts`.
2. `pnpm db:generate` — diffs schema.ts against the **last snapshot** in `migrations/meta/`, emits a new `NNNN_name.sql`, a `NNNN_snapshot.json`, and appends an entry to `_journal.json`.
3. `pnpm db:migrate` — reads `_journal.json` in order, applies any `.sql` whose entry is newer than the last row in `drizzle.__drizzle_migrations` (compared by the journal `when` timestamp), then records each applied migration's **sha256 hash** + `when` into the table.

`migrate` decides what's pending from the **journal + tracking table**, NOT from the files on disk. A `.sql` file that isn't in the journal is invisible to `migrate`. This is the #1 footgun.

## DO

- **Always** change the schema by editing `src/schema.ts` then running `pnpm db:generate`. Let drizzle write the `.sql`, the snapshot, and the journal entry together — they stay in sync automatically.
- Run `pnpm db:migrate` to apply. Then run `pnpm db:generate` once more and confirm it prints **"No schema changes, nothing to migrate"** — that proves schema.ts, the migration chain, and snapshots all agree (no drift).
- Run `npx drizzle-kit check` after any migration work — it audits the chain and should print "Everything's fine".
- Commit the `.sql`, its `meta/NNNN_snapshot.json`, AND the `meta/_journal.json` change together in the same commit. Never commit one without the others.
- Keep migrations append-only. To change something already applied, write a NEW migration.

## DON'T

- **Never hand-write a `.sql` file in `migrations/`** and expect `migrate` to pick it up. It won't — it's not in the journal. (This is exactly how `0040`–`0043` got applied-but-untracked once, and `0033_candidate_file_hash.sql` became an orphan duplicate.)
- **Never hand-edit `drizzle.__drizzle_migrations`** with tags/labels in the `hash` column. The column holds the **sha256 hex of the migration file content**, nothing else. Garbage hashes don't break `migrate` immediately but corrupt the chain and make every future diagnosis harder.
- Never reuse a migration number. Two files at the same `NNNN` (e.g. two `0033_*.sql`) is a collision — drizzle orders alphabetically and one will be silently skipped or double-counted.
- Never delete or reorder an existing applied migration. Never `git rm` a `.sql` without also removing its journal entry + snapshot and reconciling the table.
- Don't run raw `ALTER TABLE` against the DB to "just fix it fast." It diverges the DB from the migration chain. Emergency hotfixes (see below) are the only exception, and they must be backfilled.

## If the chain is already broken (recovery)

Symptoms: `db:migrate` says "applied successfully" but columns are still missing; `db:generate` emits a migration re-creating objects that already exist; counts of files/journal/table disagree.

1. **Back up first**: dump the table (`\copy drizzle.__drizzle_migrations to ...`) and copy `migrations/meta/_journal.json`.
2. Audit reality: for each migration, check whether its objects already exist in the DB (`information_schema.columns` / `.tables`, `pg_type`). The DB is the ground truth for what's actually applied.
3. Reconcile the **journal** to match the ordered `.sql` files (append missing entries with increasing `when`).
4. Rebuild the **tracking table** from the journal: one row per entry, `hash` = `shasum -a 256 migrations/<tag>.sql`, `created_at` = journal `when`. Do it in a transaction.
5. Fix **snapshots**: if `db:generate` produces a spurious migration, the latest `meta/*_snapshot.json` is stale/missing. The newly-generated snapshot is the full current schema — rename it to the latest journal tag's snapshot so the next `generate` diffs against reality. Delete the spurious `.sql` AND remove the journal entry `generate` added for it.
6. Verify: `db:migrate` (nothing pending) → `db:generate` ("No schema changes") → `drizzle-kit check` ("Everything's fine") → files == journal == table count.

## Emergency hotfix (prod column missing, app down)

Applying the migration's exact SQL by hand with `IF NOT EXISTS` is acceptable to stop the bleeding — but it leaves the tracking table behind. You MUST backfill the corresponding `drizzle.__drizzle_migrations` row (correct sha256 + `when`) afterward, or the next `db:migrate` will try to re-apply it.

## Local dev environment

Postgres runs in the `harly-postgres` Docker container (Colima). Connect: `docker exec harly-postgres psql -U harly -d harly`. `DATABASE_URL=postgresql://harly:harly@localhost:5432/harly`. If `ECONNREFUSED`: `colima start && docker compose up -d postgres`.
