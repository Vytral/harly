ALTER TYPE "public"."activity_entity_type" ADD VALUE 'document';--> statement-breakpoint
CREATE TABLE "document_access_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"access_level" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"access_level" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"assignment_type" text DEFAULT 'reviewer' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"accent" text DEFAULT 'pine' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid,
	"category_id" uuid,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"uploaded_by_id" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"storage_key" text NOT NULL,
	"category_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"signature_status" text DEFAULT 'unsigned' NOT NULL,
	"signature_provider" text,
	"signature_envelope_id" text,
	"signature_url" text,
	"expires_at" timestamp with time zone,
	"owner_id" text,
	"created_by_id" text,
	"legacy_candidate_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_access_members" ADD CONSTRAINT "document_access_members_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_members" ADD CONSTRAINT "document_access_members_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_members" ADD CONSTRAINT "document_access_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_roles" ADD CONSTRAINT "document_access_roles_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_roles" ADD CONSTRAINT "document_access_roles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_assignments" ADD CONSTRAINT "document_assignments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_assignments" ADD CONSTRAINT "document_assignments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_assignments" ADD CONSTRAINT "document_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_assignments" ADD CONSTRAINT "document_assignments_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_associations" ADD CONSTRAINT "document_associations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_associations" ADD CONSTRAINT "document_associations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_associations" ADD CONSTRAINT "document_associations_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_document_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_legacy_candidate_file_id_candidate_files_id_fk" FOREIGN KEY ("legacy_candidate_file_id") REFERENCES "public"."candidate_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_access_members_document_user_idx" ON "document_access_members" USING btree ("document_id","user_id");--> statement-breakpoint
CREATE INDEX "document_access_members_workspace_idx" ON "document_access_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_access_roles_document_role_idx" ON "document_access_roles" USING btree ("document_id","role_key");--> statement-breakpoint
CREATE INDEX "document_access_roles_workspace_idx" ON "document_access_roles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_assignments_document_user_type_idx" ON "document_assignments" USING btree ("document_id","user_id","assignment_type");--> statement-breakpoint
CREATE INDEX "document_assignments_workspace_idx" ON "document_assignments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_associations_target_idx" ON "document_associations" USING btree ("document_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "document_associations_workspace_target_idx" ON "document_associations" USING btree ("workspace_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_categories_workspace_slug_idx" ON "document_categories" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "document_categories_workspace_idx" ON "document_categories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_requirements_workspace_job_idx" ON "document_requirements" USING btree ("workspace_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "document_versions_workspace_document_idx" ON "document_versions" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_legacy_candidate_file_idx" ON "documents" USING btree ("workspace_id","legacy_candidate_file_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_status_idx" ON "documents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "documents_workspace_updated_at_idx" ON "documents" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "documents_workspace_category_idx" ON "documents" USING btree ("workspace_id","category_id");
--> statement-breakpoint
-- Surface existing candidate resumes in the new hub without changing the
-- candidate_files parser or its storage URLs. Only workspace-owned storage
-- keys are imported; malformed legacy links remain in their original table.
INSERT INTO "documents" (
  "workspace_id", "name", "original_name", "mime_type", "size_bytes",
  "checksum", "storage_key", "status", "signature_status", "owner_id",
  "created_by_id", "legacy_candidate_file_id", "created_at", "updated_at"
)
SELECT
  cf."workspace_id",
  cf."file_name",
  cf."file_name",
  COALESCE(cf."file_type", 'application/octet-stream'),
  COALESCE(cf."file_size", 0),
  COALESCE(cf."content_hash", 'legacy:' || md5(cf."file_url")),
  substring(cf."file_url" from '(workspaces/.*)$'),
  'active',
  'unsigned',
  cf."uploaded_by_id",
  cf."uploaded_by_id",
  cf."id",
  cf."created_at",
  cf."updated_at"
FROM "candidate_files" cf
WHERE substring(cf."file_url" from '(workspaces/.*)$') LIKE 'workspaces/%'
  AND NOT EXISTS (
    SELECT 1 FROM "documents" d
    WHERE d."workspace_id" = cf."workspace_id"
      AND d."legacy_candidate_file_id" = cf."id"
  );
--> statement-breakpoint
INSERT INTO "document_versions" (
  "workspace_id", "document_id", "version_number", "storage_key",
  "size_bytes", "checksum", "uploaded_by_id", "created_at"
)
SELECT
  d."workspace_id", d."id", 1, d."storage_key", d."size_bytes",
  d."checksum", d."created_by_id", d."created_at"
FROM "documents" d
WHERE d."legacy_candidate_file_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "document_versions" v WHERE v."document_id" = d."id"
  );
--> statement-breakpoint
INSERT INTO "document_associations" (
  "workspace_id", "document_id", "target_type", "target_id", "created_by_id", "created_at"
)
SELECT
  d."workspace_id", d."id", 'candidate', cf."candidate_id", d."created_by_id", d."created_at"
FROM "documents" d
JOIN "candidate_files" cf ON cf."id" = d."legacy_candidate_file_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "document_associations" a
  WHERE a."document_id" = d."id" AND a."target_type" = 'candidate'
    AND a."target_id" = cf."candidate_id"
);
