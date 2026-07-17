-- A template can replace a system email only when it is active.  Keep inactive
-- templates unrestricted, while guaranteeing a single active template per type
-- for every workspace, even under concurrent requests.
-- Retain the most recently updated template if older deployments contain a
-- duplicate active pair from before this constraint existed.
WITH ranked_active_templates AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "workspace_id", "type"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS "rank"
  FROM "email_templates"
  WHERE "is_active" = true
)
UPDATE "email_templates"
SET "is_active" = false
FROM ranked_active_templates
WHERE "email_templates"."id" = ranked_active_templates."id"
  AND ranked_active_templates."rank" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_one_active_type_idx" ON "email_templates" USING btree ("workspace_id","type") WHERE "is_active" = true;
