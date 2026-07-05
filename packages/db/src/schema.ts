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
    .$onUpdate(() => new Date())
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

export const aiRecommendationEnum = pgEnum("ai_recommendation", [
  "strong_yes",
  "yes",
  "maybe",
  "no",
]);

export const offerStatusEnum = pgEnum("offer_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "withdrawn",
]);

export const poolEntrySourceEnum = pgEnum("pool_entry_source", [
  "applied",
  "imported",
  "sourced",
  "referred",
]);

export const salaryPeriodEnum = pgEnum("salary_period", ["annual", "monthly"]);

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
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  websiteUrl: text("website_url"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
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
    logoEmail: text("logo_email"), // PNG/JPG/WebP version for email compatibility
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
  sidebarLogoStyle: logoStyleEnum("sidebar_logo_style").default("bordered").notNull(),
  // Extended/wordmark logo shown in the dashboard sidebar when sidebarLogoStyle
  // is "full". Separate light/dark assets so the mark stays legible on either
  // sidebar theme; dark falls back to light when unset.
  sidebarLogoUrl: text("sidebar_logo_url"),
  sidebarLogoDarkUrl: text("sidebar_logo_dark_url"),
  // AI provider config (bring-your-own-key). The API key is encrypted at rest
  // (AES-256-GCM) — never stored or returned in plaintext.
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  aiProvider: text("ai_provider"),
  aiModelId: text("ai_model_id"),
  // Optional custom API base URL for self-hosted / proxy endpoints.
  aiBaseUrl: text("ai_base_url"),
  aiApiKeyCiphertext: text("ai_api_key_ciphertext"),
  aiApiKeyIv: text("ai_api_key_iv"),
  aiApiKeyTag: text("ai_api_key_tag"),
  // Automatically score new applications when AI is configured.
  aiAutoScore: boolean("ai_auto_score").default(false).notNull(),
  // Automatically detect potential duplicate candidates when AI is configured.
  aiDuplicateCheck: boolean("ai_duplicate_check").default(false).notNull(),
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
  // Outbound email config (bring-your-own Resend key or SMTP). Same
  // AES-256-GCM encryption as the AI/Cal.com keys above. When disabled, the
  // platform falls back to the RESEND_API_KEY/EMAIL_FROM env vars.
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  emailProvider: text("email_provider"), // 'resend' | 'smtp'
  emailFrom: text("email_from"),
  emailApiKeyCiphertext: text("email_api_key_ciphertext"),
  emailApiKeyIv: text("email_api_key_iv"),
  emailApiKeyTag: text("email_api_key_tag"),
  // SMTP-only fields (host/port/secure/user). Password is stored in the
  // emailApiKey* columns above, alongside the Resend API key.
  emailSmtpHost: text("email_smtp_host"),
  emailSmtpPort: integer("email_smtp_port"),
  emailSmtpSecure: boolean("email_smtp_secure"),
  emailSmtpUser: text("email_smtp_user"),
  // Inbound email (receiving candidate replies). Independent toggle from
  // outbound — a workspace can send via SMTP and receive via Resend, etc.
  emailInboundEnabled: boolean("email_inbound_enabled").default(false).notNull(),
  emailInboundProvider: text("email_inbound_provider"), // 'resend' | 'postmark'
  // Domain used to build the Reply-To address (reply+{token}@{domain}) on
  // outbound sends, and shown in the UI as the domain the self-hoster must
  // point at their provider (MX record for Postmark; verified receiving
  // domain for Resend). Distinct from the outbound sending domain — a
  // self-hoster may send from mail.acme.com but receive on reply.acme.com.
  emailInboundReplyDomain: text("email_inbound_reply_domain"),
  // Shared verification secret (Postmark: Basic Auth password embedded in
  // the webhook URL, since Postmark has no HMAC scheme; Resend: passed
  // straight into resend.webhooks.verify as the svix secret). Plaintext —
  // same class as calWebhookSecret, not a bearer credential.
  emailInboundWebhookSecret: text("email_inbound_webhook_secret"),
  // Resend-only: API key for the follow-up emails.receiving.get() call.
  // Separate from the outbound emailApiKey* triple on purpose — inbound and
  // outbound providers are independent, so a workspace on SMTP-outbound +
  // Resend-inbound has no outbound Resend key to borrow.
  emailInboundResendApiKeyCiphertext: text(
    "email_inbound_resend_api_key_ciphertext",
  ),
  emailInboundResendApiKeyIv: text("email_inbound_resend_api_key_iv"),
  emailInboundResendApiKeyTag: text("email_inbound_resend_api_key_tag"),
  // Require all workspace members to enable two-factor authentication.
  require2fa: boolean("require_2fa").default(false).notNull(),
  // Shape lives in apps/web/src/features/career-page/config.ts.
  careerPageConfig: jsonb("career_page_config")
    .default(sql`'{}'::jsonb`)
    .notNull(),
  // Turnstile CAPTCHA (Cloudflare). Site key is public; secret is
  // AES-256-GCM encrypted at rest, same scheme as the AI/Cal.com keys.
  turnstileEnabled: boolean("turnstile_enabled").default(false).notNull(),
  turnstileSiteKey: text("turnstile_site_key"),
  turnstileSecretCiphertext: text("turnstile_secret_ciphertext"),
  turnstileSecretIv: text("turnstile_secret_iv"),
  turnstileSecretTag: text("turnstile_secret_tag"),
  // Chat notifications (Slack / Discord incoming-webhook). The webhook URL
  // is the only secret — encrypted at rest (AES-256-GCM).
  chatEnabled: boolean("chat_enabled").default(false).notNull(),
  chatProvider: text("chat_provider"), // 'slack' | 'discord'
  chatWebhookCiphertext: text("chat_webhook_ciphertext"),
  chatWebhookIv: text("chat_webhook_iv"),
  chatWebhookTag: text("chat_webhook_tag"),
  chatEvents: jsonb("chat_events").default(sql`'[]'::jsonb`),
  // Slack App OAuth (full API access). Bot token encrypted at rest (AES-256-GCM).
  // Client ID is public; Client Secret encrypted same as other keys.
  slackClientId: text("slack_client_id"),
  slackClientSecretCiphertext: text("slack_client_secret_ciphertext"),
  slackClientSecretIv: text("slack_client_secret_iv"),
  slackClientSecretTag: text("slack_client_secret_tag"),
  slackEnabled: boolean("slack_enabled").default(false).notNull(),
  slackTeamId: text("slack_team_id"),
  slackTeamName: text("slack_team_name"),
  slackChannelId: text("slack_channel_id"),
  slackChannelName: text("slack_channel_name"),
  slackBotTokenCiphertext: text("slack_bot_token_ciphertext"),
  slackBotTokenIv: text("slack_bot_token_iv"),
  slackBotTokenTag: text("slack_bot_token_tag"),
  slackEvents: jsonb("slack_events").default(sql`'[]'::jsonb`),
  // Google Calendar OAuth (per-user-who-connected). Refresh token encrypted at
  // rest (AES-256-GCM). Client ID/Secret come from env vars.
  gcalEnabled: boolean("gcal_enabled").default(false).notNull(),
  gcalAccountEmail: text("gcal_account_email"),
  gcalCalendarId: text("gcal_calendar_id"),
  gcalRefreshTokenCiphertext: text("gcal_refresh_token_ciphertext"),
  gcalRefreshTokenIv: text("gcal_refresh_token_iv"),
  gcalRefreshTokenTag: text("gcal_refresh_token_tag"),
  acquisitionSource: text("acquisition_source"),
  // Legal & compliance settings — per-workspace legal entity info, retention
  // policies, and customizable legal page content (Privacy Policy, Terms of
  // Service, Cookie Policy, Candidate Notice, AI Transparency Notice).
  legalEntityName: text("legal_entity_name"),
  legalEntityAddress: text("legal_entity_address"),
  legalEntityEmail: text("legal_entity_email"),
  legalEntityWebsite: text("legal_entity_website"),
  legalJurisdiction: text("legal_jurisdiction"), // 'eu' | 'us' | 'other'
  dpoEmail: text("dpo_email"), // Data Protection Officer email
  dataRetentionApplicantsMonths: integer("data_retention_applicants_months")
    .default(6)
    .notNull(),
  dataRetentionTalentPoolMonths: integer("data_retention_talent_pool_months")
    .default(24)
    .notNull(),
  consentCheckboxText: text("consent_checkbox_text"),
  // JSONB storing legal page content keyed by page type:
  // { privacyPolicy: string, termsOfService: string, cookiePolicy: string,
  //   candidateNotice: string, aiTransparencyNotice: string }
  legalPages: jsonb("legal_pages").default(sql`'{}'::jsonb`).notNull(),
  legalConfigured: boolean("legal_configured").default(false).notNull(),
  // Candidate portal — self-service portal for candidates to view their applications.
  candidatePortalEnabled: boolean("candidate_portal_enabled").default(false).notNull(),
  // Portal OAuth — Google. Client secret encrypted at rest (AES-256-GCM).
  portalGoogleClientId: text("portal_google_client_id"),
  portalGoogleClientSecretCiphertext: text("portal_google_client_secret_ciphertext"),
  portalGoogleClientSecretIv: text("portal_google_client_secret_iv"),
  portalGoogleClientSecretTag: text("portal_google_client_secret_tag"),
  // Portal OAuth — GitHub. Client secret encrypted at rest (AES-256-GCM).
  portalGithubClientId: text("portal_github_client_id"),
  portalGithubClientSecretCiphertext: text("portal_github_client_secret_ciphertext"),
  portalGithubClientSecretIv: text("portal_github_client_secret_iv"),
  portalGithubClientSecretTag: text("portal_github_client_secret_tag"),
  // Portal UI options.
  portalShowApplicationStatus: boolean("portal_show_application_status").default(true).notNull(),
  // Shareable invite link — anyone with the token can join with inviteLinkRole.
  inviteLinkToken: text("invite_link_token"),
  inviteLinkRole: text("invite_link_role").default("recruiter").notNull(),
  inviteLinkEnabled: boolean("invite_link_enabled").default(false).notNull(),
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
    avatarUrl: text("avatar_url"),
    headline: text("headline"),
    skills: jsonb("skills").default(sql`'[]'::jsonb`).notNull(),
    experienceYears: integer("experience_years"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    index("candidates_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
    index("candidates_skills_idx").using("gin", table.skills),
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
    // Opaque routing token for inbound email replies (reply+{token}@...).
    // Lazily generated on first candidate-facing send — see
    // ensureApplicationInboundToken in apps/web/src/lib/email.
    inboundToken: text("inbound_token").unique(),
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

/** One work-experience entry parsed from a résumé (structured timeline). */
export type ResumeExperienceItem = {
  company: string;
  title: string;
  dateRange: string | null;
  bullets: string[];
};

/** One education entry parsed from a résumé. */
export type ResumeEducationItem = {
  school: string;
  degree: string | null;
  field: string | null;
  dateRange: string | null;
};

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
    contentHash: text("content_hash"),
    parsedSummary: text("parsed_summary"),
    parsedSkills: jsonb("parsed_skills").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    parsedEducation: text("parsed_education"),
    parsedExperienceYears: integer("parsed_experience_years"),
    parsedExperience: jsonb("parsed_experience")
      .$type<ResumeExperienceItem[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    parsedEducationItems: jsonb("parsed_education_items")
      .$type<ResumeEducationItem[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
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
    index("candidate_files_candidate_hash_idx").on(table.candidateId, table.contentHash),
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

// Job offers — formal compensation offers extended to a candidate's
// application. Multiple offers per application are allowed (re-offer after a
// decline); the UI treats the most recent as active.
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: offerStatusEnum("status").default("draft").notNull(),
    // Offered role title — may differ from the job posting title.
    title: text("title").notNull(),
    salaryAmount: integer("salary_amount"),
    currency: text("currency"),
    salaryPeriod: salaryPeriodEnum("salary_period"),
    equity: text("equity"),
    startDate: timestamp("start_date", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("offers_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("offers_application_idx").on(table.applicationId),
    index("offers_candidate_idx").on(table.candidateId),
    index("offers_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;

// Reusable outbound email templates with {{variable}} placeholders.
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["general", "interview_invite", "rejection", "offer", "screening", "stage_change"],
    })
      .notNull()
      .default("general"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // When true, this template replaces the hardcoded system email for its
    // `type` (reject/stage-change/offer/interview). At most one active
    // template per (workspaceId, type) — enforced in the action layer, not
    // a DB constraint, since Drizzle partial unique indexes are awkward here.
    isActive: boolean("is_active").default(false).notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("email_templates_workspace_name_idx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("email_templates_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    index("email_templates_workspace_type_active_idx").on(
      table.workspaceId,
      table.type,
      table.isActive,
    ),
  ],
);

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;

// In-app notifications (mentions, and later: assignments, interviews, …)
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Recipient.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Dot-delimited kind, e.g. note.mentioned.
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    // In-app destination, e.g. /dashboard/candidates/<id>.
    href: text("href"),
    metadata: jsonb("metadata"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_user_read_created_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
    index("notifications_workspace_idx").on(table.workspaceId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// AI candidate-vs-job evaluations — one latest row per application, regenerating upserts.
export const aiEvaluations = pgTable(
  "ai_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    score: integer("score").notNull(),
    recommendation: aiRecommendationEnum("recommendation").notNull(),
    summary: text("summary").notNull(),
    // string[]
    strengths: jsonb("strengths").default(sql`'[]'::jsonb`).notNull(),
    // string[]
    gaps: jsonb("gaps").default(sql`'[]'::jsonb`).notNull(),
    // [{ label, score (0-100), evidence }]
    criteria: jsonb("criteria").default(sql`'[]'::jsonb`).notNull(),
    // True when the evaluation had resume text available (not just profile fields).
    usedResume: boolean("used_resume").default(false).notNull(),
    generatedById: text("generated_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("ai_evaluations_workspace_application_idx").on(
      table.workspaceId,
      table.applicationId,
    ),
    index("ai_evaluations_candidate_idx").on(table.candidateId),
    index("ai_evaluations_workspace_idx").on(table.workspaceId),
    index("ai_evaluations_job_idx").on(table.jobId),
  ],
);

// Embedding vector for a candidate's combined profile text (resume + skills +
// headline). Powers semantic candidate-to-job matching across the whole
// workspace, not just active applicants. Plain jsonb float array — no pgvector
// extension required, since self-hosted deployments can't assume it's installed.
export const candidateEmbeddings = pgTable(
  "candidate_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    // number[]
    embedding: jsonb("embedding").notNull(),
    // sha256 of the source text — skip re-embedding when nothing changed.
    sourceHash: text("source_hash").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("candidate_embeddings_workspace_candidate_idx").on(
      table.workspaceId,
      table.candidateId,
    ),
    index("candidate_embeddings_workspace_idx").on(table.workspaceId),
  ],
);

// Embedding vector for a job's combined text (title + description + requirements + keywords).
export const jobEmbeddings = pgTable(
  "job_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    // number[]
    embedding: jsonb("embedding").notNull(),
    sourceHash: text("source_hash").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("job_embeddings_workspace_job_idx").on(table.workspaceId, table.jobId),
    index("job_embeddings_workspace_idx").on(table.workspaceId),
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

// Candidate pool — tracks which candidates are in the talent pool and why
export const poolEntries = pgTable(
  "pool_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    reason: text("reason"),
    source: poolEntrySourceEnum("source").default("applied").notNull(),
    addedById: text("added_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("pool_entries_workspace_candidate_idx").on(
      table.workspaceId,
      table.candidateId,
      table.removedAt,
    ),
    index("pool_entries_workspace_idx").on(table.workspaceId),
    index("pool_entries_candidate_idx").on(table.candidateId),
    index("pool_entries_job_idx").on(table.jobId),
    index("pool_entries_added_at_idx").on(table.workspaceId, table.addedAt),
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
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
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
    // Threading (inbound only). Raw Message-ID header this reply is
    // responding to, plus the full References chain (space-joined, RFC
    // 2822 style) for clients that preserve it.
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    // Inbound attachment metadata only — bytes live in the configured
    // StorageAdapter, this just points at the key.
    attachments: jsonb("attachments"),
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
    gcalEventId: text("gcal_event_id"),
    briefContent: jsonb("brief_content"),
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
export type AiEvaluation = typeof aiEvaluations.$inferSelect;
export type NewAiEvaluation = typeof aiEvaluations.$inferInsert;
export type CandidateEmbedding = typeof candidateEmbeddings.$inferSelect;
export type NewCandidateEmbedding = typeof candidateEmbeddings.$inferInsert;
export type JobEmbedding = typeof jobEmbeddings.$inferSelect;
export type NewJobEmbedding = typeof jobEmbeddings.$inferInsert;
export type CandidateTag = typeof candidateTags.$inferSelect;
export type NewCandidateTag = typeof candidateTags.$inferInsert;
export type PoolEntry = typeof poolEntries.$inferSelect;
export type NewPoolEntry = typeof poolEntries.$inferInsert;
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

// ---------------------------------------------------------------------------
// Tasks — workspace-scoped to-dos assigned to team members
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // "pending" | "in_progress" | "completed" | "canceled"
    status: text("status").default("pending").notNull(),
    // "low" | "medium" | "high" | "urgent"
    priority: text("priority").default("medium").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    interviewId: uuid("interview_id").references(() => interviews.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    index("tasks_workspace_idx").on(table.workspaceId),
    index("tasks_owner_idx").on(table.ownerId),
    index("tasks_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ---------------------------------------------------------------------------
// Developer platform: API keys + outbound webhooks (public API v1)
// ---------------------------------------------------------------------------

/**
 * Workspace-scoped API credentials.
 *
 * Two kinds: `publishable` (pk_, safe in browsers / embed widget — read jobs +
 * submit applications only) and `secret` (sk_, server-to-server full CRUD).
 * The raw key is shown once at creation and never stored; we keep a SHA-256
 * `hashedKey` for O(1) constant-time lookup, plus `prefix`/`last4` for display.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // "publishable" | "secret"
    type: text("type").notNull(),
    // "live" | "test"
    environment: text("environment").default("live").notNull(),
    // Human-readable masked prefix shown in the dashboard, e.g. "harly_sk_live_a1b2".
    prefix: text("prefix").notNull(),
    last4: text("last4").notNull(),
    // SHA-256 hex digest of the full raw key. Lookups query this directly.
    hashedKey: text("hashed_key").notNull(),
    // Array of granted scope strings (see packages/api scopes).
    scopes: jsonb("scopes").default(sql`'[]'::jsonb`).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Non-null = revoked, key no longer authenticates.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("api_keys_hashed_key_idx").on(table.hashedKey),
    index("api_keys_workspace_idx").on(table.workspaceId),
    index("api_keys_workspace_type_idx").on(table.workspaceId, table.type),
  ],
);

/**
 * Outbound webhook subscriptions. Each endpoint has its own signing secret,
 * encrypted at rest (AES-256-GCM, same scheme as other workspace secrets), and
 * subscribes to a set of event types.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    // Encrypted per-endpoint signing secret (decrypted to sign each delivery).
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),
    // Array of subscribed event types (see server/webhooks/events).
    events: jsonb("events").default(sql`'[]'::jsonb`).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("webhook_endpoints_workspace_idx").on(table.workspaceId),
  ],
);

/**
 * Per-attempt delivery log for outbound webhooks. The dispatcher picks rows
 * whose `nextRetryAt` is due and re-sends with exponential backoff until they
 * succeed or are exhausted.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
    // "pending" | "success" | "failed" | "exhausted"
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    // Dispatcher scans by (status, nextRetryAt) to find due deliveries.
    index("webhook_deliveries_status_next_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
    index("webhook_deliveries_endpoint_idx").on(
      table.endpointId,
      table.createdAt,
    ),
    index("webhook_deliveries_workspace_idx").on(table.workspaceId),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// ---------------------------------------------------------------------------
// Security: WebAuthn passkeys + audit logs
// ---------------------------------------------------------------------------

/**
 * WebAuthn passkeys registered by individual users. Each row stores the
 * credential data returned by `@simplewebauthn/server` during registration.
 */
export const passkeys = pgTable(
  "passkeys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    credentialPublicKey: text("credential_public_key").notNull(),
    counter: integer("counter").default(0).notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").default(false).notNull(),
    transports: text("transports"),
    name: text("name").default("Passkey").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("passkeys_credential_id_idx").on(table.credentialId),
    index("passkeys_user_idx").on(table.userId),
  ],
);

/**
 * Short-lived WebAuthn challenges used during registration and authentication.
 * Purged on consumption or expiry.
 */
export const passkeyChallenge = pgTable(
  "passkey_challenge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    challenge: text("challenge").notNull(),
    type: text("type").notNull(), // "registration" | "authentication"
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("passkey_challenge_user_type_idx").on(table.userId, table.type),
  ],
);

/** Severity levels for audit log entries. */
export const auditSeverityEnum = pgEnum("audit_severity", [
  "info",
  "warning",
  "critical",
]);

/**
 * Workspace-scoped audit log. Captures security-relevant and admin actions
 * for compliance and visibility.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    severity: auditSeverityEnum("severity").default("info").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_action_idx").on(table.workspaceId, table.action),
  ],
);

export type Passkey = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;
export type PasskeyChallenge = typeof passkeyChallenge.$inferSelect;
export type NewPasskeyChallenge = typeof passkeyChallenge.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// ---------------------------------------------------------------------------
// Candidate portal auth — lightweight JWT-based sessions for the self-service
// candidate portal. Completely separate from recruiter better-auth sessions.
// ---------------------------------------------------------------------------

export const candidatePortalSessions = pgTable(
  "candidate_portal_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // SHA-256 hash of the raw token stored in the cookie — never store raw.
    tokenHash: text("token_hash").notNull().unique(),
    // Device/browser hint for "active sessions" list.
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("portal_sessions_candidate_idx").on(table.candidateId),
    index("portal_sessions_token_hash_idx").on(table.tokenHash),
  ],
);

// One-time magic link tokens for portal login.
export const candidatePortalMagicLinks = pgTable(
  "candidate_portal_magic_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("portal_magic_links_email_idx").on(table.email, table.workspaceId),
    index("portal_magic_links_token_hash_idx").on(table.tokenHash),
  ],
);

// ---------------------------------------------------------------------------
// GDPR / Consent records — proves consent was obtained (Art. 7 GDPR).
// ---------------------------------------------------------------------------

export const consentTypeEnum = pgEnum("consent_type", [
  "data_processing",
  "marketing",
  "ai_evaluation",
]);

export const consentRecords = pgTable(
  "consent_records",
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
    consentType: consentTypeEnum("consent_type").notNull(),
    consentText: text("consent_text").notNull(),
    granted: boolean("granted").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("consent_records_workspace_idx").on(table.workspaceId),
    index("consent_records_candidate_idx").on(table.candidateId),
    index("consent_records_application_idx").on(table.applicationId),
    index("consent_records_type_idx").on(table.consentType),
  ],
);

// ---------------------------------------------------------------------------
// DSAR (Data Subject Access Request) — tracks export/erasure requests.
// ---------------------------------------------------------------------------

export const dsarStatusEnum = pgEnum("dsar_status", [
  "pending",
  "processing",
  "completed",
  "denied",
]);

export const dsarTypeEnum = pgEnum("dsar_type", [
  "export",
  "erasure",
]);

export const dsarRequests = pgTable(
  "dsar_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    type: dsarTypeEnum("type").notNull(),
    status: dsarStatusEnum("status").default("pending").notNull(),
    requestedBy: text("requested_by"),
    processedBy: text("processed_by"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dsar_requests_workspace_idx").on(table.workspaceId),
    index("dsar_requests_candidate_idx").on(table.candidateId),
    index("dsar_requests_status_idx").on(table.status),
  ],
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
export type DsarRequest = typeof dsarRequests.$inferSelect;
export type NewDsarRequest = typeof dsarRequests.$inferInsert;

export type CandidatePortalSession = typeof candidatePortalSessions.$inferSelect;
export type NewCandidatePortalSession = typeof candidatePortalSessions.$inferInsert;
export type CandidatePortalMagicLink = typeof candidatePortalMagicLinks.$inferSelect;

// OAuth provider credentials stored per workspace.
// Mirrors the migration in 0041_oauth_providers.sql.
// Secrets encrypted AES-256-GCM, never returned in plaintext.
export const oauthProviders = pgTable(
  "oauth_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    clientId: text("client_id").notNull(),
    clientSecretCiphertext: text("client_secret_ciphertext"),
    clientSecretIv: text("client_secret_iv"),
    clientSecretTag: text("client_secret_tag"),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("oauth_providers_workspace_idx").on(table.workspaceId),
    uniqueIndex("oauth_providers_workspace_provider_unique").on(
      table.workspaceId,
      table.provider,
    ),
  ],
);

export type OAuthProvider = typeof oauthProviders.$inferSelect;
export type NewOAuthProvider = typeof oauthProviders.$inferInsert;

// ── Harly AI chat history ────────────────────────────────────────────────────
// Persistent conversations for the in-product AI copilot. Scoped to a single
// user within a workspace. Messages store the AI SDK UIMessage `parts` array
// verbatim (jsonb) so reloading a conversation re-renders text, tool calls, and
// rich result cards exactly as first streamed.
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Derived from the first user message; null until the first turn lands.
    title: text("title"),
    // Drives the history sort order; bumped on every new message.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    index("ai_conversations_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
      table.lastMessageAt,
    ),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    // "user" | "assistant" | "system"
    role: text("role").notNull(),
    // AI SDK UIMessage.parts[] stored verbatim (text, tool calls, tool outputs).
    parts: jsonb("parts").default(sql`'[]'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_messages_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
