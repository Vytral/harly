-- Data-only maintenance script (NOT a migration, no schema changes).
--
-- Local/demo data ages every time you don't touch it — "last touched" and
-- "days ago" badges creep toward "40 days ago" the longer the seed sits
-- untouched, and reports' 30-day comparison window empties out. This
-- compresses the existing story forward in time (proportional shift, same
-- factor across every linked table) so relative gaps — applied → screened →
-- interviewed → hired, note timing, time-to-hire — stay intact, just recent.
-- Interviews and tasks get direction-aware handling since "scheduled" must
-- land in the future and "completed" must stay in the past.
--
-- Safe to re-run; every UPDATE is scoped to the hardcoded workspace id below.
-- Usage: docker exec -i harly-postgres psql -U harly -d harly -f refresh-demo-freshness.sql

DO $$
DECLARE
  ws text := 'YyZYVHxI4t2YWY2XeY8gzVTijirlWg9T'; -- Syntrix (acme)
  cutoff timestamptz := '2026-07-15 00:00:00+00';  -- excludes live/real rows created during testing
  v_now timestamptz := now();
  v_pivot timestamptz;
  v_k numeric := 0.3;  -- compression factor: a row 10 days before the pivot lands 3 days before "now"
BEGIN
  SELECT max(created_at) INTO v_pivot
  FROM application_stage_history
  WHERE workspace_id = ws AND created_at < cutoff;

  IF v_pivot IS NULL THEN
    RAISE EXCEPTION 'No application_stage_history rows before cutoff for workspace %', ws;
  END IF;

  -- ── Proportional compression, same pivot + factor everywhere it matters ──
  UPDATE candidates
  SET created_at = v_now - (v_pivot - created_at) * v_k,
      updated_at = v_now - (v_pivot - updated_at) * v_k
  WHERE workspace_id = ws;

  UPDATE candidate_files
  SET created_at = v_now - (v_pivot - created_at) * v_k
  WHERE workspace_id = ws;

  UPDATE jobs
  SET created_at = v_now - (v_pivot - created_at) * v_k,
      updated_at = v_now - (v_pivot - updated_at) * v_k,
      published_at = CASE WHEN published_at IS NOT NULL
        THEN v_now - (v_pivot - published_at) * v_k ELSE NULL END
  WHERE workspace_id = ws;

  UPDATE applications
  SET applied_at = v_now - (v_pivot - applied_at) * v_k,
      created_at = v_now - (v_pivot - created_at) * v_k,
      updated_at = v_now - (v_pivot - updated_at) * v_k
  WHERE workspace_id = ws;

  UPDATE application_stage_history
  SET created_at = v_now - (v_pivot - created_at) * v_k
  WHERE workspace_id = ws AND created_at < cutoff;

  UPDATE candidate_notes
  SET created_at = v_now - (v_pivot - created_at) * v_k
  WHERE workspace_id = ws;

  UPDATE scorecards
  SET created_at = v_now - (v_pivot - created_at) * v_k
  WHERE workspace_id = ws;

  UPDATE activity_events
  SET created_at = v_now - (v_pivot - created_at) * v_k
  WHERE workspace_id = ws AND created_at < cutoff;

  -- ── Interviews: direction-aware, not proportional ──
  -- Completed/canceled → recently in the past (spread preserved, anchored a few days back).
  UPDATE interviews i
  SET scheduled_at = (v_now - interval '3 days') - (sub.max_old - i.scheduled_at),
      created_at = (v_now - interval '3 days') - (sub.max_old - i.created_at)
  FROM (
    SELECT max(scheduled_at) AS max_old
    FROM interviews
    WHERE workspace_id = ws AND status IN ('completed', 'canceled') AND scheduled_at < cutoff
  ) sub
  WHERE i.workspace_id = ws AND i.status IN ('completed', 'canceled') AND i.scheduled_at < cutoff;

  -- "Scheduled" rows stuck in the past (a real bug in stale seed data) → move
  -- into the future: two later today, the rest across the next few days.
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY scheduled_at) AS rn
    FROM interviews
    WHERE workspace_id = ws AND status = 'scheduled' AND scheduled_at < v_now
  )
  UPDATE interviews i
  SET scheduled_at = v_now + CASE ranked.rn
        WHEN 1 THEN interval '1 hour'
        WHEN 2 THEN interval '3 hours'
        WHEN 3 THEN interval '1 day 2 hours'
        ELSE interval '2 days 5 hours'
      END,
      created_at = v_now - interval '1 day'
  FROM ranked
  WHERE i.id = ranked.id;

  -- ── Tasks: pending/in-progress due dates move to "upcoming"; completed ones read as done yesterday ──
  UPDATE tasks
  SET due_date = (v_now + interval '1 day') - (sub.min_due - due_date)
  FROM (
    SELECT min(due_date) AS min_due
    FROM tasks
    WHERE workspace_id = ws AND status != 'completed' AND due_date IS NOT NULL
  ) sub
  WHERE workspace_id = ws AND status != 'completed' AND due_date IS NOT NULL;

  UPDATE tasks
  SET completed_at = v_now - interval '1 day',
      due_date = CASE WHEN due_date IS NOT NULL THEN v_now - interval '2 days' ELSE NULL END
  WHERE workspace_id = ws AND status = 'completed';

  RAISE NOTICE 'Refreshed freshness for workspace % (pivot=%, now=%, k=%)', ws, v_pivot, v_now, v_k;
END $$;
