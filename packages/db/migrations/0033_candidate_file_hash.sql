ALTER TABLE "candidate_files" ADD COLUMN "content_hash" text;
CREATE INDEX "candidate_files_candidate_hash_idx" ON "candidate_files" USING btree ("candidate_id", "content_hash");
