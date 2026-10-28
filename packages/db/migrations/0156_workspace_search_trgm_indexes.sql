-- Trigram indexes for the ⌘K workspace search. The search works without them
-- (slower sequential scans), so this migration must never fail an upgrade:
-- managed Postgres plans may refuse CREATE EXTENSION, and the extension may
-- already be present but owned by another schema. Indexes are created only when
-- pg_trgm is installed. The expressions below must stay identical to the ones
-- in features/search/workspace-search.ts (lower(...) of the searched text).

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm is unavailable; workspace search will run without trigram indexes (%)', SQLERRM;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "candidates_search_name_trgm_idx"
      ON "candidates" USING gin (lower("first_name" || ' ' || "last_name") gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "candidates_search_email_trgm_idx"
      ON "candidates" USING gin (lower("email") gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "jobs_search_title_trgm_idx"
      ON "jobs" USING gin (lower("title") gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "tasks_search_title_trgm_idx"
      ON "tasks" USING gin (lower("title") gin_trgm_ops);
  ELSE
    RAISE NOTICE 'pg_trgm is not installed; skipping workspace search trigram indexes';
  END IF;
END $$;
