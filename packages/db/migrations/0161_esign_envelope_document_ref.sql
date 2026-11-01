ALTER TABLE "signature_envelopes" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "document_name" text;--> statement-breakpoint
UPDATE "signature_envelopes" AS e SET "document_id" = d."id", "document_name" = d."name" FROM "documents" AS d WHERE d."signature_envelope_ref_id" = e."id" AND e."document_id" IS NULL;
