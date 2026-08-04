-- Corrective pass: refresh-demo-freshness.sql's proportional-compression
-- formula assumed application_stage_history's max-under-cutoff was the
-- latest timestamp across every linked table. It wasn't — jobs, candidates,
-- applications, candidate_notes and activity_events each had a few rows
-- newer than that pivot, and for those the transform overshot into the
-- future. This clamps every such row back to "now minus a small stagger",
-- ordered so their original relative order is preserved.
DO $$
DECLARE
  ws text := 'YyZYVHxI4t2YWY2XeY8gzVTijirlWg9T';
  v_now timestamptz := now();
BEGIN
  WITH bad AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM candidates WHERE workspace_id = ws AND created_at > v_now
  )
  UPDATE candidates c SET created_at = v_now - (bad.n - bad.rn + 1) * interval '15 minutes',
                          updated_at = v_now - (bad.n - bad.rn + 1) * interval '15 minutes'
  FROM bad WHERE c.id = bad.id;

  WITH bad AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM jobs WHERE workspace_id = ws AND (created_at > v_now OR updated_at > v_now OR published_at > v_now)
  )
  UPDATE jobs j SET created_at = LEAST(j.created_at, v_now - (bad.n - bad.rn + 1) * interval '20 minutes'),
                    updated_at = LEAST(j.updated_at, v_now - (bad.n - bad.rn + 1) * interval '20 minutes'),
                    published_at = CASE WHEN j.published_at IS NOT NULL
                      THEN LEAST(j.published_at, v_now - (bad.n - bad.rn + 1) * interval '20 minutes')
                      ELSE NULL END
  FROM bad WHERE j.id = bad.id;

  WITH bad AS (
    SELECT id, row_number() OVER (ORDER BY applied_at) AS rn, count(*) OVER () AS n
    FROM applications WHERE workspace_id = ws AND (applied_at > v_now OR created_at > v_now OR updated_at > v_now)
  )
  UPDATE applications a SET applied_at = v_now - (bad.n - bad.rn + 1) * interval '30 minutes',
                            created_at = v_now - (bad.n - bad.rn + 1) * interval '30 minutes',
                            updated_at = v_now - (bad.n - bad.rn + 1) * interval '30 minutes'
  FROM bad WHERE a.id = bad.id;

  WITH bad AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM candidate_notes WHERE workspace_id = ws AND created_at > v_now
  )
  UPDATE candidate_notes cn SET created_at = v_now - (bad.n - bad.rn + 1) * interval '10 minutes'
  FROM bad WHERE cn.id = bad.id;

  WITH bad AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn, count(*) OVER () AS n
    FROM activity_events WHERE workspace_id = ws AND created_at > v_now
  )
  UPDATE activity_events ae SET created_at = v_now - (bad.n - bad.rn + 1) * interval '5 minutes'
  FROM bad WHERE ae.id = bad.id;

  RAISE NOTICE 'Clamped future rows back before % for workspace %', v_now, ws;
END $$;
