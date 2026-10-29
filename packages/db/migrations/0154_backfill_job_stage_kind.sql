-- Classify existing pipeline stages. This is the only place legacy stage
-- NAMES are turned into stored meaning; the application reads
-- `job_stages.kind` from now on. Rows written later by an older build keep
-- kind NULL and are classified at read time with the same rules
-- (packages/db/src/stage-kind.ts: LEGACY_STAGE_NAME_KINDS, STAGE_NAME_TRIM_CHARS).

-- Pass 1: the default names, ignoring case and surrounding whitespace.
UPDATE "job_stages"
SET "kind" = CASE lower(btrim("name", E' \t\n\r\f\v '))
  WHEN 'applied' THEN 'applied'::"job_stage_kind"
  WHEN 'screening' THEN 'screening'::"job_stage_kind"
  WHEN 'interview' THEN 'interview'::"job_stage_kind"
  WHEN 'offer' THEN 'offer'::"job_stage_kind"
  WHEN 'hired' THEN 'hired'::"job_stage_kind"
  WHEN 'rejected' THEN 'rejected'::"job_stage_kind"
  WHEN 'withdrawn' THEN 'withdrawn'::"job_stage_kind"
  ELSE 'custom'::"job_stage_kind"
END
WHERE "kind" IS NULL;
--> statement-breakpoint
-- Pass 2: a stage renamed away from a default name ("Hired" -> "Won") would be
-- left as `custom`, and applications placed there afterwards would be reset to
-- active. When every application currently sitting in such a stage has the
-- same outcome (all hired, all rejected or all withdrawn), the stage IS that
-- outcome, so give it the matching kind. Stages with mixed or no applications
-- stay `custom` and can be reclassified in the stage editor.
UPDATE "job_stages" AS js
SET "kind" = outcome.status::"job_stage_kind"
FROM (
  SELECT "current_stage_id", min("status"::text) AS status
  FROM "applications"
  GROUP BY "current_stage_id"
  HAVING count(DISTINCT "status") = 1
     AND min("status"::text) IN ('hired', 'rejected', 'withdrawn')
) AS outcome
WHERE js."id" = outcome."current_stage_id"
  AND js."kind" = 'custom';
