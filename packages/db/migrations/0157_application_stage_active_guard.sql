-- An application may never be placed into an archived pipeline stage. Archiving
-- a stage moves its applications to a merge target inside the same transaction,
-- and every placement path re-checks, but this trigger makes the invariant hold
-- for any code path, including a placement racing with an archive.
--
-- The stage row is read FOR SHARE, so a placement that starts while an archive
-- holds the stage row waits for it, then sees the committed archived_at and is
-- refused. A placement that started first keeps its share lock, which makes the
-- archive wait for it and move the new application with the rest.
--
-- Only changes of current_stage_id are checked, so updating other columns of an
-- application that still sits in a stage archived before this migration works.
CREATE OR REPLACE FUNCTION enforce_application_stage_active() RETURNS trigger AS $$
DECLARE
  stage_archived_at timestamptz;
BEGIN
  SELECT archived_at INTO stage_archived_at
  FROM job_stages
  WHERE id = NEW.current_stage_id
  FOR SHARE;

  IF stage_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'pipeline stage % is archived; applications cannot be placed in it', NEW.current_stage_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'applications_stage_active_guard';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER applications_stage_active_guard_insert
  BEFORE INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION enforce_application_stage_active();
--> statement-breakpoint
CREATE TRIGGER applications_stage_active_guard_update
  BEFORE UPDATE OF current_stage_id ON applications
  FOR EACH ROW
  WHEN (NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id)
  EXECUTE FUNCTION enforce_application_stage_active();
