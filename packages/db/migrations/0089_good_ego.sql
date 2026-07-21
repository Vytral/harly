ALTER TABLE "document_legal_holds" DROP CONSTRAINT "document_legal_holds_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "document_legal_holds" ADD CONSTRAINT "document_legal_holds_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;