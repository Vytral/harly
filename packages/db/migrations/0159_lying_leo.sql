CREATE TABLE "rejection_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_reason_code" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_note" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejected_by_id" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rejection_reasons" ADD CONSTRAINT "rejection_reasons_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rejection_reasons_workspace_code_idx" ON "rejection_reasons" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "rejection_reasons_workspace_position_idx" ON "rejection_reasons" USING btree ("workspace_id","position");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_rejected_by_id_user_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;