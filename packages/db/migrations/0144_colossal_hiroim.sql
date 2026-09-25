UPDATE "offers" AS o
SET "status" = 'withdrawn', "updated_at" = now()
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "application_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "offers"
  WHERE "status" IN ('draft', 'sent')
) AS ranked
WHERE o.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
DELETE FROM "scorecards" AS s
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "workspace_id", "application_id", "author_id", "stage_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "scorecards"
) AS ranked
WHERE s.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
DROP INDEX "applications_workspace_candidate_job_idx";--> statement-breakpoint
DROP INDEX "candidates_workspace_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "offers_application_active_uidx" ON "offers" USING btree ("application_id") WHERE "offers"."status" in ('draft', 'sent');--> statement-breakpoint
CREATE UNIQUE INDEX "applications_workspace_candidate_job_idx" ON "applications" USING btree ("workspace_id","candidate_id","job_id") WHERE "applications"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_workspace_email_idx" ON "candidates" USING btree ("workspace_id",lower("email")) WHERE "candidates"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_workspace_application_author_stage_uidx" UNIQUE NULLS NOT DISTINCT("workspace_id","application_id","author_id","stage_id");
