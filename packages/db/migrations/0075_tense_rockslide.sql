CREATE TABLE "candidate_portal_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_show_hiring_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_portal_notifications" ADD CONSTRAINT "candidate_portal_notifications_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_portal_notifications" ADD CONSTRAINT "candidate_portal_notifications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_portal_notifications_candidate_read_created_idx" ON "candidate_portal_notifications" USING btree ("candidate_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "candidate_portal_notifications_workspace_candidate_created_idx" ON "candidate_portal_notifications" USING btree ("workspace_id","candidate_id","created_at");