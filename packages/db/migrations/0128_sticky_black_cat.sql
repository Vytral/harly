ALTER TYPE "public"."dsar_status" ADD VALUE 'blocked' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "blocked_by" text;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "review_due_at" timestamp with time zone;