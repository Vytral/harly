import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Enums
export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
]);

export const workplaceTypeEnum = pgEnum("workplace_type", [
  "remote",
  "hybrid",
  "onsite",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "open",
  "closed",
]);

export const boardStyleEnum = pgEnum("board_style", [
  "hero",
  "minimal",
]);

export const logoStyleEnum = pgEnum("logo_style", [
  "bordered",
  "full",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "active",
  "hired",
  "rejected",
  "withdrawn",
]);

export const activityEntityTypeEnum = pgEnum("activity_entity_type", [
  "candidate",
  "application",
  "job",
  "note",
]);

export const scorecardRatingEnum = pgEnum("scorecard_rating", [
  "strong",
  "mixed",
  "weak",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "outbound",
  "inbound",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "failed",
]);

export const hiringTeamRoleEnum = pgEnum("hiring_team_role", [
  "recruiter",
  "hiring_manager",
  "interviewer",
]);

export const interviewTypeEnum = pgEnum("interview_type", [
  "screening",
  "culture_fit",
  "technical",
  "onsite",
  "final",
]);

export const interviewModeEnum = pgEnum("interview_mode", [
  "video",
  "phone",
  "onsite",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled",
  "completed",
  "canceled",
]);

// Better Auth
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  location: text("location"),
  bio: text("bio"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

// Workspace branding settings (satellite of the Better Auth organization)
export const workspaceSettings = pgTable("workspace_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  tagline: text("tagline"),
  description: text("description"),
  websiteUrl: text("website_url"),
  primaryColor: text("primary_color"),
  heroImageUrl: text("hero_image_url"),
  boardStyle: boardStyleEnum("board_style").default("hero").notNull(),
  logoStyle: logoStyleEnum("logo_style").default("bordered").notNull(),
  // AI provider config (bring-your-own-key). The API key is encrypted at rest
  // (AES-256-GCM) — never stored or returned in plaintext.
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  aiProvider: text("ai_provider"),
  aiModelId: text("ai_model_id"),
  aiApiKeyCiphertext: text("ai_api_key_ciphertext"),
  aiApiKeyIv: text("ai_api_key_iv"),
  aiApiKeyTag: text("ai_api_key_tag"),
  // Cal.com scheduling (bring-your-own-key). Same AES-256-GCM encryption as the
  // AI key — the API key is never stored or returned in plaintext.
  calEnabled: boolean("cal_enabled").default(false).notNull(),
  // Base URL of the Cal.com API v2. Defaults to cloud; override for self-hosted.
  calBaseUrl: text("cal_base_url"),
  // Default event type used for programmatic bookings / slot lookups.
  calDefaultEventTypeId: integer("cal_default_event_type_id"),
  // Public Cal.com booking page (e.g. https://cal.com/acme/interview) used to
  // build prefilled self-scheduling links for candidates.
  calBookingUrl: text("cal_booking_url"),
  calApiKeyCiphertext: text("cal_api_key_ciphertext"),
  calApiKeyIv: text("cal_api_key_iv"),
  calApiKeyTag: text("cal_api_key_tag"),
  // Shared secret used to verify inbound Cal.com webhook signatures.
  calWebhookSecret: text("cal_webhook_secret"),
  ...timestamps(),
});

// Custom roles — admin-defined roles with their own permission sets. Built-in
// roles (owner/admin/recruiter/hiring_manager) live in code; these extend them.
// `key` is the slug stored in member.role for assigned members.
export const customRoles = pgTable(
  "custom_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    // Array of permission keys (see features/workspaces/permissions.ts).
    permissions: jsonb("permissions").default(sql`'[]'::jsonb`).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("custom_roles_workspace_key_idx").on(
      table.workspaceId,
      table.key,
    ),
    index("custom_roles_workspace_idx").on(table.workspaceId),
  ],
);

export type CustomRole = typeof customRoles.$inferSelect;
export type NewCustomRole = typeof customRoles.$inferInsert;

// Jobs and hiring pipeline
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    department: text("department"),
    location: text("location"),
    employmentType: employmentTypeEnum("employment_type").notNull(),
    workplaceType: workplaceTypeEnum("workplace_type").notNull(),
    description: text("description").notNull(),
    requirements: text("requirements"),
    benefits: text("benefits"),
    // Flexible, recruiter-authored description blocks: [{ id, title, body }].
    contentSections: jsonb("content_sections")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    sector: text("sector"),
    experienceLevel: text("experience_level"),
    education: text("education"),
    keywords: jsonb("keywords").default(sql`'[]'::jsonb`).notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency"),
    // 'annual' | 'monthly'
    salaryPeriod: text("salary_period"),
    // On-site / hybrid office details shown on the public page.
    officeAddress: text("office_address"),
    officeLat: doublePrecision("office_lat"),
    officeLng: doublePrecision("office_lng"),
    officePhotos: jsonb("office_photos").default(sql`'[]'::jsonb`).notNull(),
    applicationConfig: jsonb("application_config")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    boardConfig: jsonb("board_config").default(sql`'{}'::jsonb`).notNull(),
    status: jobStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Soft-delete: non-null = in trash, restorable.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("jobs_workspace_slug_idx").on(table.workspaceId, table.slug),
    index("jobs_workspace_status_idx").on(table.workspaceId, table.status),
    index("jobs_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    index("jobs_created_by_idx").on(table.createdById),
  ],
);

export const jobStages = pgTable(
  "job_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    order: integer("order").notNull(),
    emailConfig: jsonb("email_config")
      .default(sql`'{"candidateUpdatesEnabled":true}'::jsonb`)
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("job_stages_job_order_idx").on(table.jobId, table.order),
    uniqueIndex("job_stages_job_name_idx").on(table.jobId, table.name),
    index("job_stages_workspace_idx").on(table.workspaceId),
    index("job_stages_job_idx").on(table.jobId),
  ],
);

export const applicationQuestions = pgTable(
  "application_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    required: boolean("required").default(false).notNull(),
    minLength: integer("min_length"),
    placeholder: text("placeholder"),
    options: jsonb("options").default(sql`'[]'::jsonb`).notNull(),
    order: integer("order").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("application_questions_job_key_idx").on(
      table.jobId,
      table.key,
    ),
    index("application_questions_workspace_idx").on(table.workspaceId),
    index("application_questions_job_idx").on(table.jobId),
  ],
);

// Candidates and applications
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    location: text("location"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    websiteUrl: text("website_url"),
    headline: text("headline"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("candidates_workspace_email_idx").on(
      table.workspaceId,
      sql`lower(${table.email})`,
    ),
    index("candidates_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("candidates_workspace_name_idx").on(
      table.workspaceId,
      table.lastName,
      table.firstName,
    ),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    currentStageId: uuid("current_stage_id")
      .notNull()
      .references(() => jobStages.id, { onDelete: "restrict" }),
    pipelineOrder: integer("pipeline_order").default(0).notNull(),
    source: text("source"),
    status: applicationStatusEnum("status").default("active").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("applications_workspace_candidate_job_idx").on(
      table.workspaceId,
      table.candidateId,
      table.jobId,
    ),
    index("applications_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("applications_candidate_idx").on(table.candidateId),
    index("applications_job_stage_idx").on(
      table.jobId,
      table.currentStageId,
      table.pipelineOrder,
    ),
    index("applications_applied_at_idx").on(table.workspaceId, table.appliedAt),
  ],
);

export const applicationAnswers = pgTable(
  "application_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => applicationQuestions.id, { onDelete: "restrict" }),
    answer: text("answer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("application_answers_application_question_idx").on(
      table.applicationId,
      table.questionId,
    ),
    index("application_answers_workspace_idx").on(table.workspaceId),
    index("application_answers_application_idx").on(table.applicationId),
    index("application_answers_question_idx").on(table.questionId),
  ],
);

export const applicationStageHistory = pgTable(
  "application_stage_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => jobStages.id, {
      onDelete: "set null",
    }),
    toStageId: uuid("to_stage_id")
      .notNull()
      .references(() => jobStages.id, { onDelete: "restrict" }),
    movedById: text("moved_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("application_stage_history_workspace_idx").on(table.workspaceId),
    index("application_stage_history_application_idx").on(table.applicationId),
    index("application_stage_history_to_stage_idx").on(table.toStageId),
    index("application_stage_history_moved_by_idx").on(table.movedById),
  ],
);

export const applicationStageHistoryRelations = relations(
  applicationStageHistory,
  ({ one }) => ({
    fromStage: one(jobStages, {
      fields: [applicationStageHistory.fromStageId],
      references: [jobStages.id],
      relationName: "application_stage_history_from_stage",
    }),
    toStage: one(jobStages, {
      fields: [applicationStageHistory.toStageId],
      references: [jobStages.id],
      relationName: "application_stage_history_to_stage",
    }),
  }),
);

// Candidate collaboration
export const candidateNotes = pgTable(
  "candidate_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    // @mentions: [{ userId, name }] captured at write time. Drives the
    // highlighted pills + the "mentioned you" activity events.
    mentions: jsonb("mentions").default(sql`'[]'::jsonb`).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("candidate_notes_workspace_idx").on(table.workspaceId),
    index("candidate_notes_candidate_created_at_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_notes_author_idx").on(table.authorId),
  ],
);

export const candidateFiles = pgTable(
  "candidate_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type"),
    fileSize: integer("file_size"),
    uploadedById: text("uploaded_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("candidate_files_workspace_idx").on(table.workspaceId),
    index("candidate_files_candidate_created_at_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_files_uploaded_by_idx").on(table.uploadedById),
  ],
);

// Audit trail
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    entityType: activityEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // Flexible dot-delimited event name, e.g. application.created, stage.changed, note.added.
    type: text("type").notNull(),
    metadata: jsonb("metadata"),
    ...timestamps(),
  },
  (table) => [
    index("activity_events_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("activity_events_actor_idx").on(table.actorId),
    index("activity_events_entity_idx").on(table.entityType, table.entityId),
    index("activity_events_type_idx").on(table.workspaceId, table.type),
  ],
);

// Structured interview evaluations (scorecards)
export const scorecards = pgTable(
  "scorecards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    stageId: uuid("stage_id").references(() => jobStages.id, {
      onDelete: "set null",
    }),
    stageName: text("stage_name"),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    rating: scorecardRatingEnum("rating").notNull(),
    comment: text("comment"),
    // Future per-criterion scores: [{ label, score }].
    criteria: jsonb("criteria").default(sql`'[]'::jsonb`).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("scorecards_workspace_idx").on(table.workspaceId),
    index("scorecards_candidate_created_at_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("scorecards_application_idx").on(table.applicationId),
    index("scorecards_author_idx").on(table.authorId),
  ],
);

// Candidate tags
export const candidateTags = pgTable(
  "candidate_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("candidate_tags_candidate_label_idx").on(
      table.candidateId,
      sql`lower(${table.label})`,
    ),
    index("candidate_tags_workspace_idx").on(table.workspaceId),
    index("candidate_tags_candidate_idx").on(table.candidateId),
    index("candidate_tags_label_idx").on(
      table.workspaceId,
      sql`lower(${table.label})`,
    ),
  ],
);

// Hiring team — members assigned to a job
export const jobHiringTeam = pgTable(
  "job_hiring_team",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: hiringTeamRoleEnum("role").default("recruiter").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("job_hiring_team_job_user_idx").on(table.jobId, table.userId),
    index("job_hiring_team_workspace_idx").on(table.workspaceId),
    index("job_hiring_team_job_idx").on(table.jobId),
    index("job_hiring_team_user_idx").on(table.userId),
  ],
);

// Candidate communications (email thread)
export const candidateMessages = pgTable(
  "candidate_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    direction: messageDirectionEnum("direction").default("outbound").notNull(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: messageStatusEnum("status").default("sent").notNull(),
    providerMessageId: text("provider_message_id"),
    ...timestamps(),
  },
  (table) => [
    index("candidate_messages_workspace_idx").on(table.workspaceId),
    index("candidate_messages_candidate_created_at_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_messages_author_idx").on(table.authorId),
  ],
);

// Scheduled interviews — power the dashboard agenda and hiring-velocity metrics.
export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    // Interviewer is nullable so a deleted teammate doesn't cascade the interview away.
    interviewerId: text("interviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Optional human title (e.g. "Culture fit interview"); falls back to `type`.
    title: text("title"),
    type: interviewTypeEnum("type").default("screening").notNull(),
    mode: interviewModeEnum("mode").default("video").notNull(),
    status: interviewStatusEnum("status").default("scheduled").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMins: integer("duration_mins").default(45).notNull(),
    location: text("location"),
    notes: text("notes"),
    // How this interview was created: in-app or synced from Cal.com.
    source: text("source").default("manual").notNull(),
    // Cal.com booking UID — set when the interview originates from / is synced
    // with a Cal.com booking. Lets the webhook upsert instead of duplicating.
    calBookingUid: text("cal_booking_uid"),
    ...timestamps(),
  },
  (table) => [
    index("interviews_workspace_scheduled_at_idx").on(
      table.workspaceId,
      table.scheduledAt,
    ),
    index("interviews_application_idx").on(table.applicationId),
    index("interviews_job_idx").on(table.jobId),
    index("interviews_candidate_idx").on(table.candidateId),
    index("interviews_interviewer_idx").on(table.interviewerId),
    // Composite (not global) so a Cal.com booking uid is unique *per workspace*.
    // A global index would let a webhook for workspace B collide-and-overwrite
    // workspace A's interview via the upsert conflict target. Postgres treats
    // NULLs as distinct, so manual interviews (no uid) are unaffected.
    uniqueIndex("interviews_workspace_cal_booking_uid_idx").on(
      table.workspaceId,
      table.calBookingUid,
    ),
  ],
);

export const interviewsRelations = relations(interviews, ({ one }) => ({
  application: one(applications, {
    fields: [interviews.applicationId],
    references: [applications.id],
  }),
  job: one(jobs, {
    fields: [interviews.jobId],
    references: [jobs.id],
  }),
  candidate: one(candidates, {
    fields: [interviews.candidateId],
    references: [candidates.id],
  }),
  interviewer: one(user, {
    fields: [interviews.interviewerId],
    references: [user.id],
  }),
}));

export type Scorecard = typeof scorecards.$inferSelect;
export type NewScorecard = typeof scorecards.$inferInsert;
export type CandidateTag = typeof candidateTags.$inferSelect;
export type NewCandidateTag = typeof candidateTags.$inferInsert;
export type JobHiringTeamMember = typeof jobHiringTeam.$inferSelect;
export type NewJobHiringTeamMember = typeof jobHiringTeam.$inferInsert;
export type CandidateMessage = typeof candidateMessages.$inferSelect;
export type NewCandidateMessage = typeof candidateMessages.$inferInsert;
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;

export type ApplicationAnswer = typeof applicationAnswers.$inferSelect;
export type NewApplicationAnswer = typeof applicationAnswers.$inferInsert;
export type ApplicationQuestion = typeof applicationQuestions.$inferSelect;
export type NewApplicationQuestion = typeof applicationQuestions.$inferInsert;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type NewWorkspaceSettings = typeof workspaceSettings.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobStage = typeof jobStages.$inferSelect;
export type NewJobStage = typeof jobStages.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationStageHistory =
  typeof applicationStageHistory.$inferSelect;
export type NewApplicationStageHistory =
  typeof applicationStageHistory.$inferInsert;
export type CandidateNote = typeof candidateNotes.$inferSelect;
export type NewCandidateNote = typeof candidateNotes.$inferInsert;
export type CandidateFile = typeof candidateFiles.$inferSelect;
export type NewCandidateFile = typeof candidateFiles.$inferInsert;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
export type AuthUser = typeof user.$inferSelect;
export type NewAuthUser = typeof user.$inferInsert;
export type AuthSession = typeof session.$inferSelect;
export type NewAuthSession = typeof session.$inferInsert;
export type AuthAccount = typeof account.$inferSelect;
export type NewAuthAccount = typeof account.$inferInsert;
export type AuthVerification = typeof verification.$inferSelect;
export type NewAuthVerification = typeof verification.$inferInsert;
export type AuthOrganization = typeof organization.$inferSelect;
export type NewAuthOrganization = typeof organization.$inferInsert;
export type AuthMember = typeof member.$inferSelect;
export type NewAuthMember = typeof member.$inferInsert;
export type AuthInvitation = typeof invitation.$inferSelect;
export type NewAuthInvitation = typeof invitation.$inferInsert;
