CREATE TABLE "candidate_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid,
	"referred_by_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"note" text,
	"featured" boolean DEFAULT false NOT NULL,
	"featured_by_id" text,
	"featured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "evaluation_mode" text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_referred_by_id_user_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_referrals" ADD CONSTRAINT "candidate_referrals_featured_by_id_user_id_fk" FOREIGN KEY ("featured_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_referrals_candidate_referrer_job_uidx" ON "candidate_referrals" USING btree ("candidate_id","referred_by_id",coalesce("job_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "candidate_referrals_workspace_idx" ON "candidate_referrals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "candidate_referrals_candidate_idx" ON "candidate_referrals" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_referrals_job_idx" ON "candidate_referrals" USING btree ("job_id");