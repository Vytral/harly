ALTER TABLE "candidate_files" ADD COLUMN "parsed_summary" text;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD COLUMN "parsed_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD COLUMN "parsed_education" text;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD COLUMN "parsed_experience_years" integer;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD COLUMN "parsed_at" timestamp with time zone;