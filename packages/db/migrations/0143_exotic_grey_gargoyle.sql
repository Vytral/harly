DELETE FROM "member" AS m
USING (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "organization_id", "user_id"
      ORDER BY
        CASE WHEN "status" = 'active' THEN 0 ELSE 1 END,
        "updated_at" DESC NULLS LAST,
        "created_at" DESC NULLS LAST,
        "id" DESC
    ) AS rn
  FROM "member"
) AS d
WHERE m.ctid = d.ctid AND d.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_uidx" ON "member" USING btree ("organization_id","user_id");
