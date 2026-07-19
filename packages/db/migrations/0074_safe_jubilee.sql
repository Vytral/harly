ALTER TABLE "dsar_requests" DROP CONSTRAINT "dsar_requests_candidate_id_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "dsar_requests" ALTER COLUMN "candidate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;