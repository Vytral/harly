CREATE TABLE "document_legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"placed_by_id" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by_id" text,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_legal_holds" ADD CONSTRAINT "document_legal_holds_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_legal_holds" ADD CONSTRAINT "document_legal_holds_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_legal_holds" ADD CONSTRAINT "document_legal_holds_placed_by_id_user_id_fk" FOREIGN KEY ("placed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_legal_holds" ADD CONSTRAINT "document_legal_holds_released_by_id_user_id_fk" FOREIGN KEY ("released_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_legal_holds_workspace_document_idx" ON "document_legal_holds" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE INDEX "document_legal_holds_workspace_active_idx" ON "document_legal_holds" USING btree ("workspace_id","released_at");