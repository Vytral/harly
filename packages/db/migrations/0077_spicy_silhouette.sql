DROP INDEX "pool_entries_workspace_candidate_idx";--> statement-breakpoint
-- Keep the newest active entry per workspace/candidate. The id DESC tie-breaker
-- makes cleanup deterministic when timestamps are identical.
WITH ranked_active_entries AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workspace_id, candidate_id
      ORDER BY updated_at DESC, added_at DESC, id DESC
    ) AS duplicate_rank
  FROM pool_entries
  WHERE removed_at IS NULL
), duplicates AS (
  SELECT id
  FROM ranked_active_entries
  WHERE duplicate_rank > 1
)
UPDATE pool_entries AS entry
SET removed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM duplicates
WHERE entry.id = duplicates.id;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_entries_active_workspace_candidate_idx" ON "pool_entries" USING btree ("workspace_id","candidate_id") WHERE "pool_entries"."removed_at" is null;
