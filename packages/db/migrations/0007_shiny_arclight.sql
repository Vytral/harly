DROP INDEX "interviews_cal_booking_uid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_workspace_cal_booking_uid_idx" ON "interviews" USING btree ("workspace_id","cal_booking_uid");