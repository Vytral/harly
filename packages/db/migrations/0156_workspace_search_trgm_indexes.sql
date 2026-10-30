-- Trigram indexes for the Cmd/Ctrl+K workspace search. Search works without
-- them (slower sequential scans), so this migration must NEVER fail an upgrade:
--   * managed Postgres plans may refuse CREATE EXTENSION,
--   * pg_trgm may already live in a schema that is not on the search_path
--     (for example "extensions"), where an unqualified gin_trgm_ops does not
--     resolve, and
--   * any single index may fail for an unrelated reason.
-- So the extension's real schema is looked up and the operator class qualified
-- with it, and every index is created in its own exception block.
--
-- CREATE INDEX runs inside the migration transaction (not CONCURRENTLY), so it
-- briefly blocks writes to candidates, jobs and tasks while each index builds;
-- this takes seconds on installations with up to several hundred thousand rows.
--
-- The expressions below must stay identical to the ones in
-- features/search/workspace-search.ts (lower(...) of the searched text).

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm is unavailable; workspace search will run without trigram indexes (%)', SQLERRM;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  trgm_schema text;
  definition record;
BEGIN
  SELECT n.nspname INTO trgm_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF trgm_schema IS NULL THEN
    RAISE NOTICE 'pg_trgm is not installed; skipping workspace search trigram indexes';
    RETURN;
  END IF;

  FOR definition IN
    SELECT * FROM (VALUES
      ('candidates_search_name_trgm_idx',  'candidates', 'lower("first_name" || '' '' || "last_name")'),
      ('candidates_search_email_trgm_idx', 'candidates', 'lower("email")'),
      ('jobs_search_title_trgm_idx',       'jobs',       'lower("title")'),
      ('tasks_search_title_trgm_idx',      'tasks',      'lower("title")')
    ) AS t(index_name, table_name, expression)
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING gin (%s %I.gin_trgm_ops)',
        definition.index_name, definition.table_name, definition.expression, trgm_schema
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skipped trigram index %: %', definition.index_name, SQLERRM;
    END;
  END LOOP;
END $$;
