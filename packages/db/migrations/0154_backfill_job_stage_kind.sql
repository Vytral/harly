-- Classify existing pipeline stages by the name they carry today. This is the
-- only place the legacy name -> meaning mapping is applied to stored data; the
-- application reads `job_stages.kind` from now on. Stages renamed away from a
-- default name before this migration become `custom`. Rows written later by an
-- older build keep kind NULL and are classified at read time.
UPDATE "job_stages"
SET "kind" = CASE lower(btrim("name"))
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
