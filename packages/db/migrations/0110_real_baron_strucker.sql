CREATE TABLE "username_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_username" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "specialties" text[];--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "languages" text[];--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "weekly_availability" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "capacity_hours_per_week" integer;--> statement-breakpoint
ALTER TABLE "username_history" ADD CONSTRAINT "username_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "username_history_old_username_uidx" ON "username_history" USING btree ("old_username");--> statement-breakpoint
CREATE INDEX "username_history_userId_idx" ON "username_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_uidx" ON "user" USING btree ("username");