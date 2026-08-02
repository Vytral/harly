CREATE TABLE "signature_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"type" text NOT NULL,
	"page" integer NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"w" double precision NOT NULL,
	"h" double precision NOT NULL,
	"label" text,
	"required" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_fields_type_check" CHECK ("signature_fields"."type" in ('signature', 'text')),
	CONSTRAINT "signature_fields_geometry_check" CHECK ("signature_fields"."page" >= 1 AND "signature_fields"."x" >= 0 AND "signature_fields"."y" >= 0 AND "signature_fields"."w" > 0 AND "signature_fields"."h" > 0 AND "signature_fields"."x" + "signature_fields"."w" <= 1 AND "signature_fields"."y" + "signature_fields"."h" <= 1)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "fields_signature_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "fields_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signature_fields_workspace_document_idx" ON "signature_fields" USING btree ("workspace_id","document_id");