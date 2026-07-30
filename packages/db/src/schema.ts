import { relations, sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
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

export const jobStatusEnum = pgEnum("job_status", ["draft", "open", "closed"]);

export const jobApprovalStatusEnum = pgEnum("job_approval_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const boardStyleEnum = pgEnum("board_style", ["hero", "minimal"]);

export const logoStyleEnum = pgEnum("logo_style", ["bordered", "full"]);

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
  "document",
  "task",
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

export const mailSourceEnum = pgEnum("mail_source", [
  "imap",
  "legacy-webhook",
  "provider",
  "smtp",
]);

export const mailIdempotencyStatusEnum = pgEnum("mail_idempotency_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "unknown",
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

export const interviewSyncProviderEnum = pgEnum("interview_sync_provider", [
  "google_calendar",
  "zoom",
  "microsoft_teams",
  "jitsi",
]);

export const interviewSyncOperationEnum = pgEnum("interview_sync_operation", [
  "upsert",
  "cancel",
]);

export const interviewSyncStatusEnum = pgEnum("interview_sync_status", [
  "pending",
  "synced",
  "failed",
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

// Workflow engine: per-execution lifecycle of a workflow run.
export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "running",
  "succeeded",
  "failed",
  "skipped",
  "dead_letter",
]);

export const memberStatusEnum = pgEnum("member_status", [
  "active",
  "inactive",
  "suspended",
]);

// Better Auth
export const user = pgTable(
  "user",
  {
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
    username: text("username"),
    timezone: text("timezone"),
    specialties: text("specialties").array(),
    languages: text("languages").array(),
    weeklyAvailability: jsonb(
      "weekly_availability",
    ).$type<WeeklyAvailability>(),
    capacityHoursPerWeek: integer("capacity_hours_per_week"),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    // Set when an owner provisions the account with a temporary password; the
    // member is forced through /change-password on next sign-in, after which it
    // clears. Keeps the provisioning owner from retaining a working credential.
    mustChangePassword: boolean("must_change_password")
      .default(false)
      .notNull(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    onboardingRole: text("onboarding_role"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("user_username_uidx").on(table.username)],
);

export type TimeRange = { start: string; end: string };
export type WeeklyAvailability = {
  monday: TimeRange[];
  tuesday: TimeRange[];
  wednesday: TimeRange[];
  thursday: TimeRange[];
  friday: TimeRange[];
  saturday: TimeRange[];
  sunday: TimeRange[];
};

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

// Better Auth twoFactor plugin storage. Keep the exported model name in
// camelCase: Better Auth resolves this exact key from the schema object
// passed to the Drizzle adapter.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count")
      .default(0)
      .notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (table) => [index("two_factor_userId_idx").on(table.userId)],
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
    // Tenant-local attributes used by contextual RBAC. They intentionally live
    // on membership rather than user because one person may belong to several
    // workspaces with different reporting lines and regional access.
    department: text("department"),
    region: text("region"),
    team: text("team"),
    // Validated as a same-workspace member in the service layer. Keeping this
    // nullable reference unbound avoids a Better Auth self-relation cycle in
    // the generated TypeScript schema.
    managerMemberId: text("manager_member_id"),
    status: memberStatusEnum("status").default("active").notNull(),
    scimExternalId: text("scim_external_id"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    index("member_manager_idx").on(table.managerMemberId),
    uniqueIndex("member_org_scim_external_id_idx").on(
      table.organizationId,
      table.scimExternalId,
    ),
  ],
);

export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;

/** Workspace-scoped bearer credentials for SCIM provisioning. Only the hash
 * is persisted; the raw token is shown once at creation time. */
export const scimTokens = pgTable(
  "scim_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("scim_tokens_workspace_idx").on(table.workspaceId),
    index("scim_tokens_active_idx").on(table.workspaceId, table.revokedAt),
  ],
);

export type ScimToken = typeof scimTokens.$inferSelect;
export type NewScimToken = typeof scimTokens.$inferInsert;

/** Virtual per-recruiter sender identity (From display only). Never a real
 * mailbox — inbound routing stays on the per-application reply-token system. */
export const memberSenderIdentity = pgTable(
  "member_sender_identity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    localPart: text("local_part").notNull(),
    displayName: text("display_name"),
    isManuallyEdited: boolean("is_manually_edited").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("member_sender_identity_member_uidx").on(table.memberId),
    uniqueIndex("member_sender_identity_org_localpart_uidx").on(
      table.organizationId,
      table.localPart,
    ),
    index("member_sender_identity_org_idx").on(table.organizationId),
  ],
);

export const usernameHistory = pgTable(
  "username_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    oldUsername: text("old_username").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("username_history_old_username_uidx").on(table.oldUsername),
    index("username_history_userId_idx").on(table.userId),
  ],
);

export type UsernameHistory = typeof usernameHistory.$inferSelect;
export type NewUsernameHistory = typeof usernameHistory.$inferInsert;

export type MemberSenderIdentity = typeof memberSenderIdentity.$inferSelect;
export type NewMemberSenderIdentity = typeof memberSenderIdentity.$inferInsert;

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

// Enterprise SSO providers managed by the @better-auth/sso plugin.
// Keep the exported model name in camelCase: Better Auth resolves this exact
// key from the schema object passed to the Drizzle adapter.
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    domain: text("domain").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("sso_provider_domain_idx").on(table.domain),
    index("sso_provider_organization_idx").on(table.organizationId),
  ],
);

/**
 * One row per deployment. It is deliberately separate from Better Auth so the
 * first account and workspace can be reserved and completed under a
 * PostgreSQL row lock.
 */
export const deploymentBootstrap = pgTable(
  "deployment_bootstrap",
  {
    id: integer("id").default(1).primaryKey(),
    authorizedEmail: text("authorized_email").notNull(),
    claimId: uuid("claim_id"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "restrict",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    check("deployment_bootstrap_singleton_check", sql`${table.id} = 1`),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
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

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
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
  mailUnificationEnabled: boolean("mail_unification_enabled")
    .default(false)
    .notNull(),
  tagline: text("tagline"),
  description: text("description"),
  websiteUrl: text("website_url"),
  primaryColor: text("primary_color"),
  heroImageUrl: text("hero_image_url"),
  boardStyle: boardStyleEnum("board_style").default("hero").notNull(),
  logoStyle: logoStyleEnum("logo_style").default("bordered").notNull(),
  sidebarLogoStyle: logoStyleEnum("sidebar_logo_style")
    .default("bordered")
    .notNull(),
  // Extended/wordmark logo shown in the dashboard sidebar when sidebarLogoStyle
  // is "full". Separate light/dark assets so the mark stays legible on either
  // sidebar theme; dark falls back to light when unset.
  sidebarLogoUrl: text("sidebar_logo_url"),
  sidebarLogoDarkUrl: text("sidebar_logo_dark_url"),
  // When true, product emails omit the "Powered by Harly" footer credit and
  // system emails (invites, welcome) show the workspace name instead of Harly.
  hideHarlyBranding: boolean("hide_harly_branding").default(false).notNull(),
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
  // Redact identifying candidate details (name, contact, links, demographic
  // signals) from resumes during application review to reduce unconscious bias.
  aiResumeAnonymization: boolean("ai_resume_anonymization")
    .default(false)
    .notNull(),
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
  emailInboundEnabled: boolean("email_inbound_enabled")
    .default(false)
    .notNull(),
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
  // Enterprise access controls. Empty lists mean the control is disabled.
  securityIpAllowlist: jsonb("security_ip_allowlist")
    .default(sql`'[]'::jsonb`)
    .notNull(),
  securityAllowedDomains: jsonb("security_allowed_domains")
    .default(sql`'[]'::jsonb`)
    .notNull(),
  securityRiskDetectionEnabled: boolean("security_risk_detection_enabled")
    .default(true)
    .notNull(),
  securityReauthMinutes: integer("security_reauth_minutes")
    .default(15)
    .notNull(),
  securityRequirePasskey: boolean("security_require_passkey")
    .default(false)
    .notNull(),
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
  // Active CAPTCHA provider selector (mirror of chatProvider / chatEnabled).
  // One provider active per workspace; keys per provider are kept so switching
  // doesn't lose them. Turnstile keys reuse the turnstile* columns above.
  captchaEnabled: boolean("captcha_enabled").default(false).notNull(),
  captchaProvider: text("captcha_provider"), // 'turnstile' | 'recaptcha' | 'hcaptcha'
  // Google reCAPTCHA v2 keys. Secret AES-256-GCM encrypted at rest.
  recaptchaSiteKey: text("recaptcha_site_key"),
  recaptchaSecretCiphertext: text("recaptcha_secret_ciphertext"),
  recaptchaSecretIv: text("recaptcha_secret_iv"),
  recaptchaSecretTag: text("recaptcha_secret_tag"),
  // hCaptcha keys. Secret AES-256-GCM encrypted at rest.
  hcaptchaSiteKey: text("hcaptcha_site_key"),
  hcaptchaSecretCiphertext: text("hcaptcha_secret_ciphertext"),
  hcaptchaSecretIv: text("hcaptcha_secret_iv"),
  hcaptchaSecretTag: text("hcaptcha_secret_tag"),
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
  slackAppId: text("slack_app_id"),
  slackBotUserId: text("slack_bot_user_id"),
  slackEnterpriseId: text("slack_enterprise_id"),
  slackScopes: jsonb("slack_scopes").default(sql`'[]'::jsonb`),
  slackInstallerUserId: text("slack_installer_user_id"),
  slackInstalledAt: timestamp("slack_installed_at", { withTimezone: true }),
  slackLastValidatedAt: timestamp("slack_last_validated_at", {
    withTimezone: true,
  }),
  slackRevokedAt: timestamp("slack_revoked_at", { withTimezone: true }),
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
  legalJurisdiction: text("legal_jurisdiction"), // 'eu' | 'us' | 'cl' | 'br' | 'other'
  dpoEmail: text("dpo_email"), // Data Protection Officer email
  dataRetentionApplicantsMonths: integer("data_retention_applicants_months")
    .default(6)
    .notNull(),
  dataRetentionTalentPoolMonths: integer("data_retention_talent_pool_months")
    .default(24)
    .notNull(),
  // Opt-in switch for the retention-enforcement cron. Off by default: the
  // months above are advisory until a workspace explicitly turns on
  // automatic anonymization, so no one loses data they didn't ask to purge.
  dataRetentionEnabled: boolean("data_retention_enabled")
    .default(false)
    .notNull(),
  // Audit records are retained independently from candidate PII. A minimum
  // window keeps compliance evidence available without allowing unbounded
  // tenant growth. Enforcement is performed by the retention cron.
  auditLogRetentionMonths: integer("audit_log_retention_months")
    .default(24)
    .notNull(),
  consentCheckboxText: text("consent_checkbox_text"),
  // JSONB storing legal page content keyed by page type:
  // { privacyPolicy: string, termsOfService: string, cookiePolicy: string,
  //   candidateNotice: string, aiTransparencyNotice: string }
  legalPages: jsonb("legal_pages")
    .default(sql`'{}'::jsonb`)
    .notNull(),
  legalConfigured: boolean("legal_configured").default(false).notNull(),
  // Candidate portal — self-service portal for candidates to view their applications.
  candidatePortalEnabled: boolean("candidate_portal_enabled")
    .default(false)
    .notNull(),
  // Portal OAuth — Google. Client secret encrypted at rest (AES-256-GCM).
  portalGoogleClientId: text("portal_google_client_id"),
  portalGoogleClientSecretCiphertext: text(
    "portal_google_client_secret_ciphertext",
  ),
  portalGoogleClientSecretIv: text("portal_google_client_secret_iv"),
  portalGoogleClientSecretTag: text("portal_google_client_secret_tag"),
  // Portal OAuth — GitHub. Client secret encrypted at rest (AES-256-GCM).
  portalGithubClientId: text("portal_github_client_id"),
  portalGithubClientSecretCiphertext: text(
    "portal_github_client_secret_ciphertext",
  ),
  portalGithubClientSecretIv: text("portal_github_client_secret_iv"),
  portalGithubClientSecretTag: text("portal_github_client_secret_tag"),
  // Portal OAuth — LinkedIn. Client secret encrypted at rest (AES-256-GCM).
  portalLinkedinClientId: text("portal_linkedin_client_id"),
  portalLinkedinClientSecretCiphertext: text(
    "portal_linkedin_client_secret_ciphertext",
  ),
  portalLinkedinClientSecretIv: text("portal_linkedin_client_secret_iv"),
  portalLinkedinClientSecretTag: text("portal_linkedin_client_secret_tag"),
  // Portal UI options.
  portalShowApplicationStatus: boolean("portal_show_application_status")
    .default(true)
    .notNull(),
  // Keep the hiring team private unless a workspace explicitly opts in.
  portalShowHiringTeam: boolean("portal_show_hiring_team")
    .default(false)
    .notNull(),
  // Shareable invite link — anyone with the token can join with inviteLinkRole.
  inviteLinkToken: text("invite_link_token"),
  inviteLinkRole: text("invite_link_role").default("recruiter").notNull(),
  inviteLinkEnabled: boolean("invite_link_enabled").default(false).notNull(),
  // Microsoft Outlook OAuth (per-workspace credentials). Tokens encrypted at
  // rest (AES-256-GCM). Client ID/Secret from env vars or per-workspace DB.
  outlookClientId: text("outlook_client_id"),
  outlookClientSecretCiphertext: text("outlook_client_secret_ciphertext"),
  outlookClientSecretIv: text("outlook_client_secret_iv"),
  outlookClientSecretTag: text("outlook_client_secret_tag"),
  outlookEnabled: boolean("outlook_enabled").default(false).notNull(),
  outlookAccountEmail: text("outlook_account_email"),
  outlookAccessTokenCiphertext: text("outlook_access_token_ciphertext"),
  outlookAccessTokenIv: text("outlook_access_token_iv"),
  outlookAccessTokenTag: text("outlook_access_token_tag"),
  outlookRefreshTokenCiphertext: text("outlook_refresh_token_ciphertext"),
  outlookRefreshTokenIv: text("outlook_refresh_token_iv"),
  outlookRefreshTokenTag: text("outlook_refresh_token_tag"),
  outlookCalendarId: text("outlook_calendar_id"),
  outlookEvents: jsonb("outlook_events").default(sql`'[]'::jsonb`),
  // Zoom OAuth (per-workspace credentials). Token encrypted at rest (AES-256-GCM).
  zoomClientId: text("zoom_client_id"),
  zoomClientSecretCiphertext: text("zoom_client_secret_ciphertext"),
  zoomClientSecretIv: text("zoom_client_secret_iv"),
  zoomClientSecretTag: text("zoom_client_secret_tag"),
  zoomEnabled: boolean("zoom_enabled").default(false).notNull(),
  zoomAccountId: text("zoom_account_id"),
  zoomAccountEmail: text("zoom_account_email"),
  zoomTokenCiphertext: text("zoom_token_ciphertext"),
  zoomTokenIv: text("zoom_token_iv"),
  zoomTokenTag: text("zoom_token_tag"),
  zoomRefreshTokenCiphertext: text("zoom_refresh_token_ciphertext"),
  zoomRefreshTokenIv: text("zoom_refresh_token_iv"),
  zoomRefreshTokenTag: text("zoom_refresh_token_tag"),
  zoomEvents: jsonb("zoom_events").default(sql`'[]'::jsonb`),

  // Telegram notifications. Bot token is the only secret (AES-GCM triple);
  // chat id is a plain destination identifier. Rides the same event emission
  // points as chat/webhooks.
  telegramEnabled: boolean("telegram_enabled").default(false).notNull(),
  telegramBotTokenCiphertext: text("telegram_bot_token_ciphertext"),
  telegramBotTokenIv: text("telegram_bot_token_iv"),
  telegramBotTokenTag: text("telegram_bot_token_tag"),
  telegramChatId: text("telegram_chat_id"),
  telegramBotUsername: text("telegram_bot_username"),
  telegramEvents: jsonb("telegram_events").default(sql`'[]'::jsonb`),

  // Jitsi Meet video links. No API, no secrets , the workspace's instance base
  // URL is the only config; rooms are random slugs composed per interview.
  jitsiEnabled: boolean("jitsi_enabled").default(false).notNull(),
  jitsiBaseUrl: text("jitsi_base_url"),
  // DocuSeal (self-hosted e-signature). Base instance URL + an API token
  // (X-Auth-Token, encrypted at rest) is all that's needed — no OAuth. The
  // webhook secret is a plaintext shared token appended to the callback URL and
  // checked on inbound submission events (same class as calWebhookSecret).
  docusealEnabled: boolean("docuseal_enabled").default(false).notNull(),
  docusealUrl: text("docuseal_url"),
  docusealApiTokenCiphertext: text("docuseal_api_token_ciphertext"),
  docusealApiTokenIv: text("docuseal_api_token_iv"),
  docusealApiTokenTag: text("docuseal_api_token_tag"),
  docusealWebhookSecret: text("docuseal_webhook_secret"),
  // Native signing rollout and workspace policy. Native is deliberately off
  // by default so each workspace can be enabled progressively.
  nativeSignEnabled: boolean("native_sign_enabled").default(true).notNull(),
  remoteSignEnabled: boolean("remote_sign_enabled").default(false).notNull(),
  savedSignaturesEnabled: boolean("saved_signatures_enabled")
    .default(false)
    .notNull(),
  signatureOtpEnabled: boolean("signature_otp_enabled")
    .default(false)
    .notNull(),
  signatureTimelineEnabled: boolean("signature_timeline_enabled")
    .default(false)
    .notNull(),
  signatureSecurityMode: text("signature_security_mode")
    .default("link_only")
    .notNull(),
  signatureExpirationDays: integer("signature_expiration_days")
    .default(30)
    .notNull(),
  // Offer delivery channel: "email" (default) or "esign" (collect signature via
  // embedded signing inside the candidate portal, email notifies instead).
  offerSignatureChannel: text("offer_signature_channel")
    .default("email")
    .notNull(),
  ...timestamps(),
});

/**
 * Durable Slack notification queue. Slack is an external side effect, so the
 * hiring transaction only needs to persist this row; the cron dispatcher owns
 * retries and delivery state.
 */
export const slackDeliveries = pgTable(
  "slack_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    channelId: text("channel_id").notNull(),
    payload: jsonb("payload")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    dedupeKey: text("dedupe_key"),
    // pending | processing | success | failed | dead_letter
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    slackError: text("slack_error"),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    replayOfId: uuid("replay_of_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("slack_deliveries_workspace_dedupe_idx").on(
      table.workspaceId,
      table.dedupeKey,
    ),
    index("slack_deliveries_status_next_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
    index("slack_deliveries_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("slack_deliveries_workspace_channel_updated_idx").on(
      table.workspaceId,
      table.channelId,
      table.updatedAt,
    ),
  ],
);

export const slackDeliveryAttempts = pgTable(
  "slack_delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => slackDeliveries.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    responseStatus: integer("response_status"),
    slackError: text("slack_error"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("slack_delivery_attempts_delivery_attempt_idx").on(
      table.deliveryId,
      table.attempt,
    ),
    index("slack_delivery_attempts_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
  ],
);

/**
 * One shared recruiting mailbox per workspace in v1. Secrets are kept as
 * AES-GCM triples; plaintext credentials never leave the server process.
 */
export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull(),
    imapTls: boolean("imap_tls").default(true).notNull(),
    imapUser: text("imap_user").notNull(),
    imapPasswordCiphertext: text("imap_password_ciphertext").notNull(),
    imapPasswordIv: text("imap_password_iv").notNull(),
    imapPasswordTag: text("imap_password_tag").notNull(),
    sourceFolder: text("source_folder").default("INBOX").notNull(),
    sentFolder: text("sent_folder"),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    smtpTls: boolean("smtp_tls").default(true).notNull(),
    smtpUser: text("smtp_user").notNull(),
    smtpPasswordCiphertext: text("smtp_password_ciphertext").notNull(),
    smtpPasswordIv: text("smtp_password_iv").notNull(),
    smtpPasswordTag: text("smtp_password_tag").notNull(),
    uidValidity: text("uid_validity"),
    lastUid: integer("last_uid").default(0).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("mailboxes_workspace_unique").on(table.workspaceId),
    index("mailboxes_workspace_enabled_idx").on(
      table.workspaceId,
      table.enabled,
    ),
  ],
);

export const mailThreads = pgTable(
  "mail_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, {
      onDelete: "cascade",
    }),
    source: mailSourceEnum("source").default("imap").notNull(),
    conversationId: uuid("conversation_id").defaultRandom().notNull(),
    subject: text("subject").notNull(),
    normalizedSubject: text("normalized_subject").notNull(),
    participantEmail: text("participant_email"),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "set null",
    }),
    status: text("status").default("open").notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    index("mail_threads_workspace_status_last_idx").on(
      table.workspaceId,
      table.status,
      table.lastMessageAt,
    ),
    index("mail_threads_mailbox_participant_idx").on(
      table.mailboxId,
      table.participantEmail,
    ),
    index("mail_threads_candidate_idx").on(table.candidateId),
    index("mail_threads_workspace_conversation_idx").on(
      table.workspaceId,
      table.conversationId,
    ),
    check(
      "mail_threads_source_mailbox_check",
      sql`(${table.source} = 'imap' AND ${table.mailboxId} IS NOT NULL) OR (${table.source} IN ('legacy-webhook', 'provider', 'smtp') AND ${table.mailboxId} IS NULL)`,
    ),
  ],
);

export const mailMessages = pgTable(
  "mail_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => mailThreads.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    imapUid: integer("imap_uid"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    direction: messageDirectionEnum("direction").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmails: jsonb("to_emails")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    subject: text("subject").notNull(),
    textBody: text("text_body").notNull(),
    htmlBody: text("html_body"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("mail_messages_thread_uid_unique").on(
      table.threadId,
      table.imapUid,
    ),
    uniqueIndex("mail_messages_workspace_message_id_unique").on(
      table.workspaceId,
      table.messageId,
    ),
    index("mail_messages_thread_received_idx").on(
      table.threadId,
      table.receivedAt,
    ),
  ],
);

export const mailAttachments = pgTable(
  "mail_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => mailMessages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("mail_attachments_workspace_message_idx").on(
      table.workspaceId,
      table.messageId,
    ),
  ],
);

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
    permissions: jsonb("permissions")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // Contextual constraints are evaluated server-side in addition to the
    // permission set. Empty arrays mean unrestricted access for that axis.
    scope: jsonb("scope")
      .$type<{
        jobAccess?: "all" | "assigned";
        departments?: string[];
        regions?: string[];
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
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
    keywords: jsonb("keywords")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency"),
    // 'annual' | 'monthly'
    salaryPeriod: text("salary_period"),
    // On-site / hybrid office details shown on the public page.
    officeAddress: text("office_address"),
    officeLat: doublePrecision("office_lat"),
    officeLng: doublePrecision("office_lng"),
    officePhotos: jsonb("office_photos")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // Structured public-job fields used for JobPosting schema and Google for Jobs.
    jobLocationCountry: text("job_location_country"),
    jobLocationRegion: text("job_location_region"),
    remoteEligibleCountries: jsonb("remote_eligible_countries")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    applicationConfig: jsonb("application_config")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    boardConfig: jsonb("board_config")
      .default(sql`'{}'::jsonb`)
      .notNull(),
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
    index("jobs_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("jobs_workspace_deleted_created_idx").on(
      table.workspaceId,
      table.deletedAt,
      table.createdAt,
    ),
    index("jobs_created_by_idx").on(table.createdById),
  ],
);

export const jobApprovalRequests = pgTable(
  "job_approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approverId: text("approver_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: jobApprovalStatusEnum("status").default("pending").notNull(),
    comment: text("comment"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("job_approval_requests_workspace_idx").on(table.workspaceId),
    index("job_approval_requests_job_idx").on(table.jobId),
    index("job_approval_requests_approver_status_idx").on(
      table.approverId,
      table.status,
    ),
  ],
);

export type JobApprovalRequest = typeof jobApprovalRequests.$inferSelect;
export type NewJobApprovalRequest = typeof jobApprovalRequests.$inferInsert;

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
    options: jsonb("options")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    order: integer("order").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("application_questions_job_key_idx").on(table.jobId, table.key),
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
    address: text("address"),
    location: text("location"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    websiteUrl: text("website_url"),
    avatarUrl: text("avatar_url"),
    headline: text("headline"),
    summary: text("summary"),
    skills: jsonb("skills")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    experienceYears: integer("experience_years"),
    educationEntries: jsonb("education_entries")
      .$type<CandidateEducationEntry[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    experienceEntries: jsonb("experience_entries")
      .$type<CandidateExperienceEntry[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Set by the data-retention cron when this candidate's PII was redacted
    // (see anonymize.ts). Distinct from deletedAt: an anonymized candidate's
    // row + pipeline history stay for metrics, only identity fields are wiped.
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
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
    index("candidates_workspace_deleted_updated_idx").on(
      table.workspaceId,
      table.deletedAt,
      table.updatedAt,
    ),
    index("candidates_workspace_anonymized_idx").on(
      table.workspaceId,
      table.anonymizedAt,
    ),
    index("candidates_skills_idx").using("gin", table.skills),
  ],
);

/**
 * Durable candidate erasure queue. Database rows and object storage are two
 * separate systems, so candidate deletion must survive process restarts and
 * be safely retried instead of relying on an in-process request.
 */
export const candidateDeletionJobs = pgTable(
  "candidate_deletion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id"),
    // The generated fallback keeps an in-flight migration safe if a worker
    // inserts a row between the table and column migrations.
    dedupeKey: text("dedupe_key")
      .default(sql`'legacy:' || gen_random_uuid()::text`)
      .notNull(),
    requestType: text("request_type").default("candidate_delete").notNull(),
    status: text("status").default("pending").notNull(),
    phase: text("phase").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    blockedReason: text("blocked_reason"),
    requestedBy: text("requested_by"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    stats: jsonb("stats").$type<Record<string, number>>(),
    durationMs: integer("duration_ms"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("candidate_deletion_jobs_workspace_request_idx").on(
      table.workspaceId,
      table.requestId,
    ),
    uniqueIndex("candidate_deletion_jobs_workspace_dedupe_idx").on(
      table.workspaceId,
      table.dedupeKey,
    ),
    index("candidate_deletion_jobs_due_idx").on(
      table.status,
      table.nextRetryAt,
      table.lockedAt,
    ),
    index("candidate_deletion_jobs_workspace_candidate_idx").on(
      table.workspaceId,
      table.candidateId,
    ),
  ],
);

export type CandidateDeletionJob = typeof candidateDeletionJobs.$inferSelect;
export type NewCandidateDeletionJob = typeof candidateDeletionJobs.$inferInsert;

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
    coverLetter: text("cover_letter"),
    snapshot: jsonb("snapshot")
      .default(sql`'{}'::jsonb`)
      .notNull(),
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
    index("applications_workspace_job_applied_idx").on(
      table.workspaceId,
      table.jobId,
      table.appliedAt,
    ),
  ],
);

/** Optional self-identification data, kept separate from candidate PII. */
export const candidateDemographics = pgTable(
  "candidate_demographics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    gender: text("gender"),
    ethnicity: text("ethnicity"),
    disability: text("disability"),
    veteranStatus: text("veteran_status"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("self_reported"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("candidate_demographics_candidate_uidx").on(table.candidateId),
    index("candidate_demographics_workspace_idx").on(table.workspaceId),
  ],
);

export type CandidateDemographics = typeof candidateDemographics.$inferSelect;
export type NewCandidateDemographics =
  typeof candidateDemographics.$inferInsert;

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
    index("application_stage_history_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
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
    mentions: jsonb("mentions")
      .default(sql`'[]'::jsonb`)
      .notNull(),
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

export type CandidateEducationEntry = {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

export type CandidateExperienceEntry = {
  id: string;
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  current: boolean | null;
  location: string | null;
  description: string | null;
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
    parsedSkills: jsonb("parsed_skills")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
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
    index("candidate_files_candidate_hash_idx").on(
      table.candidateId,
      table.contentHash,
    ),
  ],
);

// ATS documents. These tables deliberately keep storage keys private: every
// read goes through the authenticated document download route.
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    storageKey: text("storage_key").notNull(),
    categoryId: uuid("category_id").references(() => documentCategories.id, {
      onDelete: "set null",
    }),
    status: text("status").default("active").notNull(),
    signatureStatus: text("signature_status").default("unsigned").notNull(),
    signatureProvider: text("signature_provider"),
    signatureEnvelopeId: text("signature_envelope_id"),
    signatureEnvelopeRefId: uuid("signature_envelope_ref_id").references(
      () => signatureEnvelopes.id,
      { onDelete: "set null" },
    ),
    signatureUrl: text("signature_url"),
    // Manual "signed offline" attestation. Only set for non-externally-managed
    // providers when a manager marks a document signed by hand: who attested,
    // when, and a mandatory note (e.g. "signed in person 2026-07-22, scan on
    // file"). Externally-managed providers (DocuSeal) leave these null — their
    // evidence is the combined PDF + audit-log artifacts.
    manualSignedById: text("manual_signed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    manualSignedAt: timestamp("manual_signed_at", { withTimezone: true }),
    manualSignatureNote: text("manual_signature_note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    legacyCandidateFileId: uuid("legacy_candidate_file_id").references(
      () => candidateFiles.id,
      { onDelete: "set null" },
    ),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("documents_workspace_legacy_candidate_file_idx").on(
      table.workspaceId,
      table.legacyCandidateFileId,
    ),
    index("documents_workspace_status_idx").on(table.workspaceId, table.status),
    index("documents_workspace_updated_at_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    index("documents_workspace_category_idx").on(
      table.workspaceId,
      table.categoryId,
    ),
    index("documents_workspace_signature_envelope_idx").on(
      table.workspaceId,
      table.signatureEnvelopeRefId,
    ),
  ],
);

export const documentCategories = pgTable(
  "document_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    accent: text("accent").default("pine").notNull(),
    active: boolean("active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("document_categories_workspace_slug_idx").on(
      table.workspaceId,
      table.slug,
    ),
    index("document_categories_workspace_idx").on(table.workspaceId),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    uploadedById: text("uploaded_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    isCurrent: boolean("is_current").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_versions_document_version_idx").on(
      table.documentId,
      table.versionNumber,
    ),
    index("document_versions_workspace_document_idx").on(
      table.workspaceId,
      table.documentId,
    ),
  ],
);

export const documentAssociations = pgTable(
  "document_associations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_associations_target_idx").on(
      table.documentId,
      table.targetType,
      table.targetId,
    ),
    index("document_associations_workspace_target_idx").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const documentAccessRoles = pgTable(
  "document_access_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    roleKey: text("role_key").notNull(),
    accessLevel: text("access_level").default("read").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_access_roles_document_role_idx").on(
      table.documentId,
      table.roleKey,
    ),
    index("document_access_roles_workspace_idx").on(table.workspaceId),
  ],
);

export const documentAccessMembers = pgTable(
  "document_access_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessLevel: text("access_level").default("read").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_access_members_document_user_idx").on(
      table.documentId,
      table.userId,
    ),
    index("document_access_members_workspace_idx").on(table.workspaceId),
  ],
);

export const documentAssignments = pgTable(
  "document_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignmentType: text("assignment_type").default("reviewer").notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_assignments_document_user_type_idx").on(
      table.documentId,
      table.userId,
      table.assignmentType,
    ),
    index("document_assignments_workspace_idx").on(table.workspaceId),
  ],
);

export const documentRequirements = pgTable(
  "document_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => jobStages.id, {
      onDelete: "cascade",
    }),
    categoryId: uuid("category_id").references(() => documentCategories.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    required: boolean("required").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("document_requirements_workspace_job_idx").on(
      table.workspaceId,
      table.jobId,
    ),
  ],
);

// A legal hold is deliberately separate from document status and retention
// dates. Multiple independent notices may protect the same document; releasing
// one must not release another. Physical objects remain untouched while a hold
// is active.
export const documentLegalHolds = pgTable(
  "document_legal_holds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      // Keep the hold record authoritative: a future physical deletion must
      // be explicitly reconciled instead of cascading through the hold.
      .references(() => documents.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    reference: text("reference"),
    placedById: text("placed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    releasedById: text("released_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    ...timestamps(),
  },
  (table) => [
    index("document_legal_holds_workspace_document_idx").on(
      table.workspaceId,
      table.documentId,
    ),
    index("document_legal_holds_workspace_active_idx").on(
      table.workspaceId,
      table.releasedAt,
    ),
  ],
);

// Document requests: a recruiter asks a candidate to provide a document (ID,
// signed NDA, tax form, …) through the candidate portal. Scoped to an
// application; candidateId is denormalized for the candidate-profile view. When
// the candidate uploads, `documentId` links the resulting Documents-hub file and
// status advances to `submitted`, then a reviewer accepts/declines/waives it.
export const documentRequests = pgTable(
  "document_requests",
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
    title: text("title").notNull(),
    instructions: text("instructions"),
    // pending → submitted → accepted | declined ; or waived from pending/submitted.
    status: text("status").default("pending").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // The uploaded Documents-hub file fulfilling this request (null until submitted).
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    requestedById: text("requested_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedById: text("reviewed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    ...timestamps(),
  },
  (table) => [
    index("document_requests_workspace_candidate_idx").on(
      table.workspaceId,
      table.candidateId,
    ),
    index("document_requests_workspace_application_status_idx").on(
      table.workspaceId,
      table.applicationId,
      table.status,
    ),
    index("document_requests_document_idx").on(table.documentId),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type DocumentLegalHold = typeof documentLegalHolds.$inferSelect;
export type DocumentRequest = typeof documentRequests.$inferSelect;
export type NewDocumentRequest = typeof documentRequests.$inferInsert;

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
    criteria: jsonb("criteria")
      .default(sql`'[]'::jsonb`)
      .notNull(),
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
    // DocuSeal submission id (provider-neutral e-signature). Correlates the
    // inbound submission webhook back to the offer. Null for email-only offers.
    esignSubmissionId: text("esign_submission_id"),
    signatureEnvelopeRefId: uuid("signature_envelope_ref_id").references(
      () => signatureEnvelopes.id,
      { onDelete: "set null" },
    ),
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
    index("offers_workspace_signature_envelope_idx").on(
      table.workspaceId,
      table.signatureEnvelopeRefId,
    ),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;

// Provider-independent signing domain. The provider's identifiers are stored
// for reconciliation, while Harly owns the lifecycle, recipients, evidence, and
// document relationships. This lets another provider be added without adding
// more provider-specific columns to documents or offers.
export const signatureEnvelopes = pgTable(
  "signature_envelopes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").default("docuseal").notNull(),
    providerEnvelopeId: text("provider_envelope_id").notNull(),
    kind: text("kind").default("document").notNull(),
    status: text("status").default("created").notNull(),
    // Kept as an indexed correlation field. The offer owns the FK to avoid a
    // circular Drizzle initializer between offers and signature envelopes.
    offerId: uuid("offer_id"),
    subject: text("subject"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastEventKey: text("last_event_key"),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    nextReconcileAt: timestamp("next_reconcile_at", { withTimezone: true }),
    reconcileLockedUntil: timestamp("reconcile_locked_until", {
      withTimezone: true,
    }),
    reconcileAttempts: integer("reconcile_attempts").default(0).notNull(),
    reconcileError: text("reconcile_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("signature_envelopes_workspace_provider_id_idx").on(
      table.workspaceId,
      table.provider,
      table.providerEnvelopeId,
    ),
    index("signature_envelopes_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("signature_envelopes_workspace_offer_idx").on(
      table.workspaceId,
      table.offerId,
    ),
    index("signature_envelopes_reconcile_idx").on(
      table.workspaceId,
      table.status,
      table.nextReconcileAt,
    ),
  ],
);

export const signatureRecipients = pgTable(
  "signature_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: uuid("envelope_id")
      .notNull()
      .references(() => signatureEnvelopes.id, { onDelete: "cascade" }),
    providerRecipientId: text("provider_recipient_id").notNull(),
    role: text("role").default("signer").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    routingOrder: integer("routing_order").default(1).notNull(),
    clientUserId: text("client_user_id"),
    // Provider hosted signing URL for this recipient (DocuSeal embed_src /
    // `${url}/s/{slug}`). Lets the portal redirect the candidate to sign without
    // a second provider round-trip. Null for remote (email-driven) signers.
    signingUrl: text("signing_url"),
    linkExpiresAt: timestamp("link_expires_at", { withTimezone: true }),
    status: text("status").default("created").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declinedReason: text("declined_reason"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("signature_recipients_envelope_provider_id_idx").on(
      table.envelopeId,
      table.providerRecipientId,
    ),
    index("signature_recipients_workspace_envelope_idx").on(
      table.workspaceId,
      table.envelopeId,
    ),
  ],
);

export const signatureEvents = pgTable(
  "signature_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: uuid("envelope_id")
      .notNull()
      .references(() => signatureEnvelopes.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    retryCount: integer("retry_count"),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("signature_events_workspace_key_idx").on(
      table.workspaceId,
      table.eventKey,
    ),
    index("signature_events_workspace_envelope_idx").on(
      table.workspaceId,
      table.envelopeId,
    ),
  ],
);

export const signatureArtifacts = pgTable(
  "signature_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: uuid("envelope_id")
      .notNull()
      .references(() => signatureEnvelopes.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    documentVersionId: uuid("document_version_id").references(
      () => documentVersions.id,
      { onDelete: "set null" },
    ),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    certificateVersion: integer("certificate_version"),
    metadata: jsonb("metadata")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("signature_artifacts_envelope_kind_idx").on(
      table.envelopeId,
      table.kind,
    ),
    index("signature_artifacts_workspace_envelope_idx").on(
      table.workspaceId,
      table.envelopeId,
    ),
  ],
);

export type SignatureEnvelope = typeof signatureEnvelopes.$inferSelect;
export type SignatureRecipient = typeof signatureRecipients.$inferSelect;
export type SignatureEvent = typeof signatureEvents.$inferSelect;
export type SignatureArtifact = typeof signatureArtifacts.$inferSelect;

// Private, reusable signature images. ownerId intentionally has no foreign key:
// dashboard users and portal candidates are different identity tables.
export const savedSignatures = pgTable(
  "saved_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("saved_signatures_workspace_owner_idx").on(
      table.workspaceId,
      table.ownerType,
      table.ownerId,
    ),
  ],
);

export const nativeSignatureOtpChallenges = pgTable(
  "native_signature_otp_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => signatureRecipients.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("native_signature_otp_recipient_idx").on(table.recipientId),
    index("native_signature_otp_expiry_idx").on(table.expiresAt),
  ],
);

export const signatureEvidenceEvents = pgTable(
  "signature_evidence_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: uuid("envelope_id")
      .notNull()
      .references(() => signatureEnvelopes.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").references(() => signatureRecipients.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    payload: jsonb("payload")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    previousHash: text("previous_hash"),
    currentHash: text("current_hash").notNull(),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
    }),
    legalHold: boolean("legal_hold").default(false).notNull(),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("signature_evidence_event_hash_idx").on(table.currentHash),
    index("signature_evidence_workspace_envelope_idx").on(
      table.workspaceId,
      table.envelopeId,
      table.occurredAt,
    ),
  ],
);

export type SavedSignature = typeof savedSignatures.$inferSelect;
export type NativeSignatureOtpChallenge =
  typeof nativeSignatureOtpChallenges.$inferSelect;
export type SignatureEvidenceEvent =
  typeof signatureEvidenceEvents.$inferSelect;

/** Durable queue for outbound candidate communications. Workers may retry a
 * pending row safely; application mutations never depend on a dropped promise. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    dedupeKey: text("dedupe_key")
      .default(sql`'legacy:' || gen_random_uuid()::text`)
      .notNull(),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("email_outbox_workspace_status_retry_idx").on(
      table.workspaceId,
      table.status,
      table.nextRetryAt,
    ),
    uniqueIndex("email_outbox_workspace_dedupe_uidx").on(
      table.workspaceId,
      table.dedupeKey,
    ),
  ],
);

/** Operational history only: no job payloads and no raw errors. */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    job: text("job").notNull(),
    runId: uuid("run_id").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    counters: jsonb("counters")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("cron_runs_run_id_uidx").on(table.runId),
    index("cron_runs_job_created_idx").on(table.job, table.createdAt),
  ],
);

export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type NewEmailOutbox = typeof emailOutbox.$inferInsert;

/** Durable domain-event queue. Realtime delivery is intentionally separate:
 * SSE notifications are ephemeral, while these rows support retries for
 * integrations, automations, and other durable consumers. */
export const domainEventOutbox = pgTable(
  "domain_event_outbox",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    eventId: uuid("event_id").defaultRandom().notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    eventVersion: integer("event_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    aggregateType: text("aggregate_type"),
    aggregateId: text("aggregate_id"),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("domain_event_outbox_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("domain_event_outbox_pending_idx").on(
      table.publishedAt,
      table.createdAt,
    ),
  ],
);

export type DomainEventOutbox = typeof domainEventOutbox.$inferSelect;
export type NewDomainEventOutbox = typeof domainEventOutbox.$inferInsert;

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
      enum: [
        "general",
        "interview_invite",
        "rejection",
        "offer",
        "screening",
        "stage_change",
      ],
    })
      .notNull()
      .default("general"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // When true, this template replaces the hardcoded system email for its
    // `type` (reject/stage-change/offer/interview). At most one active
    // template per (workspaceId, type), enforced by the partial unique index
    // below as well as the action transaction.
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
    uniqueIndex("email_templates_one_active_type_idx")
      .on(table.workspaceId, table.type)
      .where(sql`${table.isActive} = true`),
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
    // Stable event key used to make retried domain notifications idempotent.
    dedupeKey: text("dedupe_key"),
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
    uniqueIndex("notifications_workspace_user_dedupe_idx").on(
      table.workspaceId,
      table.userId,
      table.dedupeKey,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// Versioned, recruiter-approved evaluation rubric. AI and deterministic rules
// are both consumers of this neutral contract.
export const evaluationRubrics = pgTable(
  "evaluation_rubrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").default("draft").notNull(),
    // Immutable snapshot of the rubric metadata and weights.
    configHash: text("config_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("evaluation_rubrics_workspace_job_version_idx").on(
      table.workspaceId,
      table.jobId,
      table.version,
    ),
    uniqueIndex("evaluation_rubrics_workspace_job_hash_idx").on(
      table.workspaceId,
      table.jobId,
      table.configHash,
    ),
    index("evaluation_rubrics_workspace_job_status_idx").on(
      table.workspaceId,
      table.jobId,
      table.status,
    ),
  ],
);

export const evaluationCriteria = pgTable(
  "evaluation_criteria",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => evaluationRubrics.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(),
    importance: text("importance").default("preferred").notNull(),
    weight: integer("weight").notNull(),
    aliases: jsonb("aliases")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    minimumValue: integer("minimum_value"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("evaluation_criteria_rubric_key_idx").on(
      table.rubricId,
      table.key,
    ),
    index("evaluation_criteria_rubric_idx").on(table.rubricId),
  ],
);

// Candidate-vs-job evaluations. The legacy table name is retained for a
// backwards-compatible rollout; the source/engine fields make the contract
// explicitly neutral to AI.
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
    rubricId: uuid("rubric_id").references(() => evaluationRubrics.id, {
      onDelete: "set null",
    }),
    engine: text("engine").default("harly").notNull(),
    engineVersion: text("engine_version").default("legacy").notNull(),
    rubricVersion: text("rubric_version").default("legacy").notNull(),
    inputHash: text("input_hash"),
    outputHash: text("output_hash"),
    evidenceCoverage: integer("evidence_coverage"),
    confidence: integer("confidence"),
    requiresHumanReview: boolean("requires_human_review")
      .default(true)
      .notNull(),
    evaluationStatus: text("evaluation_status").default("completed").notNull(),
    rubricSnapshot: jsonb("rubric_snapshot"),
    // Evaluation engine: "ai" for provider-backed scoring, "rules" for the
    // deterministic, explainable Harly Algorithm.
    source: text("source").default("ai").notNull(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    score: integer("score").notNull(),
    recommendation: aiRecommendationEnum("recommendation").notNull(),
    summary: text("summary").notNull(),
    // string[]
    strengths: jsonb("strengths")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // string[]
    gaps: jsonb("gaps")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // [{ label, score (0-100), evidence }]
    criteria: jsonb("criteria")
      .default(sql`'[]'::jsonb`)
      .notNull(),
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

export const evaluationCriterionResults = pgTable(
  "evaluation_criterion_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => aiEvaluations.id, { onDelete: "cascade" }),
    criterionKey: text("criterion_key").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    score: integer("score"),
    weight: integer("weight"),
    evidence: text("evidence"),
    evidenceSource: text("evidence_source"),
    confidence: integer("confidence"),
    missingReason: text("missing_reason"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("evaluation_criterion_results_evaluation_key_idx").on(
      table.evaluationId,
      table.criterionKey,
    ),
    index("evaluation_criterion_results_evaluation_idx").on(table.evaluationId),
  ],
);

// Durable evaluation work queue. Application writes enqueue work; workers may
// claim/retry it without relying on an in-process promise surviving a restart.
export const evaluationJobs = pgTable(
  "evaluation_jobs",
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
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dedupeKey: text("dedupe_key").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("evaluation_jobs_workspace_dedupe_idx").on(
      table.workspaceId,
      table.dedupeKey,
    ),
    index("evaluation_jobs_due_idx").on(
      table.status,
      table.nextRetryAt,
      table.lockedAt,
    ),
    index("evaluation_jobs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
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
    uniqueIndex("job_embeddings_workspace_job_idx").on(
      table.workspaceId,
      table.jobId,
    ),
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
    index("candidate_tags_workspace_label_candidate_idx").on(
      table.workspaceId,
      sql`lower(${table.label})`,
      table.candidateId,
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
    uniqueIndex("pool_entries_active_workspace_candidate_idx")
      .on(table.workspaceId, table.candidateId)
      .where(sql`${table.removedAt} is null`),
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
    // A reply stays unread until a workspace member opens it from the
    // dedicated replies mailbox or from the candidate communication thread.
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("candidate_messages_workspace_idx").on(table.workspaceId),
    index("candidate_messages_candidate_created_at_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_messages_author_idx").on(table.authorId),
    uniqueIndex("candidate_messages_workspace_provider_message_id_unique").on(
      table.workspaceId,
      table.providerMessageId,
    ),
    index("candidate_messages_workspace_direction_read_created_idx").on(
      table.workspaceId,
      table.direction,
      table.readAt,
      table.createdAt,
    ),
  ],
);

export const mailUnificationMigrations = pgTable(
  "mail_unification_migrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateMessageId: uuid("candidate_message_id")
      .notNull()
      .references(() => candidateMessages.id, { onDelete: "cascade" }),
    mailMessageId: uuid("mail_message_id").references(() => mailMessages.id, {
      onDelete: "set null",
    }),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").default("migrated").notNull(),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("mail_unification_migrations_candidate_unique").on(
      table.workspaceId,
      table.candidateMessageId,
    ),
    index("mail_unification_migrations_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const mailIdempotencyKeys = pgTable(
  "mail_idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    messageId: text("message_id").notNull(),
    status: mailIdempotencyStatusEnum("status").default("pending").notNull(),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    threadId: uuid("thread_id").references(() => mailThreads.id, {
      onDelete: "set null",
    }),
    mailMessageId: uuid("mail_message_id").references(() => mailMessages.id, {
      onDelete: "set null",
    }),
    providerMessageId: text("provider_message_id"),
    payloadHash: text("payload_hash").notNull(),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("mail_idempotency_workspace_key_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("mail_idempotency_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
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
    meetLink: text("meet_link"),
    teamsMeetingId: text("teams_meeting_id"),
    zoomMeetingId: text("zoom_meeting_id"),
    // Jitsi room slug (e.g. "hsy-qiab-ksn"). Non-null ⟹ Jitsi built the link.
    jitsiRoom: text("jitsi_room"),
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

/**
 * Durable provider synchronization state. The interview remains the source
 * of truth; this table records the desired provider operation and makes
 * failures visible/reclaimable instead of leaving them only in logs.
 */
export const interviewSyncs = pgTable(
  "interview_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    provider: interviewSyncProviderEnum("provider").notNull(),
    operation: interviewSyncOperationEnum("operation")
      .default("upsert")
      .notNull(),
    status: interviewSyncStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    providerResourceId: text("provider_resource_id"),
    providerUrl: text("provider_url"),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("interview_syncs_interview_provider_idx").on(
      table.interviewId,
      table.provider,
    ),
    index("interview_syncs_due_idx").on(table.status, table.nextRetryAt),
    index("interview_syncs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export type Scorecard = typeof scorecards.$inferSelect;
export type NewScorecard = typeof scorecards.$inferInsert;
export type EvaluationRubric = typeof evaluationRubrics.$inferSelect;
export type NewEvaluationRubric = typeof evaluationRubrics.$inferInsert;
export type EvaluationCriterion = typeof evaluationCriteria.$inferSelect;
export type NewEvaluationCriterion = typeof evaluationCriteria.$inferInsert;
export type AiEvaluation = typeof aiEvaluations.$inferSelect;
export type NewAiEvaluation = typeof aiEvaluations.$inferInsert;
export type EvaluationCriterionResult =
  typeof evaluationCriterionResults.$inferSelect;
export type NewEvaluationCriterionResult =
  typeof evaluationCriterionResults.$inferInsert;
export type EvaluationJob = typeof evaluationJobs.$inferSelect;
export type NewEvaluationJob = typeof evaluationJobs.$inferInsert;
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
export type MailThread = typeof mailThreads.$inferSelect;
export type NewMailThread = typeof mailThreads.$inferInsert;
export type MailMessage = typeof mailMessages.$inferSelect;
export type NewMailMessage = typeof mailMessages.$inferInsert;
export type MailAttachment = typeof mailAttachments.$inferSelect;
export type NewMailAttachment = typeof mailAttachments.$inferInsert;
export type MailUnificationMigration =
  typeof mailUnificationMigrations.$inferSelect;
export type NewMailUnificationMigration =
  typeof mailUnificationMigrations.$inferInsert;
export type MailIdempotencyKey = typeof mailIdempotencyKeys.$inferSelect;
export type NewMailIdempotencyKey = typeof mailIdempotencyKeys.$inferInsert;
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
export type InterviewSync = typeof interviewSyncs.$inferSelect;
export type NewInterviewSync = typeof interviewSyncs.$inferInsert;

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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    index("tasks_workspace_deleted_idx").on(table.workspaceId, table.deletedAt),
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
    scopes: jsonb("scopes")
      .default(sql`'[]'::jsonb`)
      .notNull(),
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
 * Durable responses for mutating developer API requests carrying an
 * `Idempotency-Key`. Keys are scoped to the authenticated credential and route
 * so a retry can safely replay the original result without repeating writes.
 */
export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    // SHA-256 of the exact request body. Same key with a different body fails.
    requestHash: text("request_hash").notNull(),
    // "processing" | "completed"
    status: text("status").default("processing").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("api_idempotency_keys_key_route_uidx").on(
      table.apiKeyId,
      table.method,
      table.path,
      table.idempotencyKey,
    ),
    index("api_idempotency_keys_workspace_expires_idx").on(
      table.workspaceId,
      table.expiresAt,
    ),
    index("api_idempotency_keys_expires_idx").on(table.expiresAt),
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
    events: jsonb("events")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [index("webhook_endpoints_workspace_idx").on(table.workspaceId)],
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
    payload: jsonb("payload")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    // "pending" | "processing" | "success" | "failed" | "dead_letter"
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    replayOfId: uuid("replay_of_id"),
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
export type ApiIdempotencyKey = typeof apiIdempotencyKeys.$inferSelect;
export type NewApiIdempotencyKey = typeof apiIdempotencyKeys.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type SlackDelivery = typeof slackDeliveries.$inferSelect;
export type NewSlackDelivery = typeof slackDeliveries.$inferInsert;
export type SlackDeliveryAttempt = typeof slackDeliveryAttempts.$inferSelect;

/** Immutable per-attempt audit trail for outbound webhook delivery. */
export const webhookDeliveryAttempts = pgTable(
  "webhook_delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => webhookDeliveries.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_delivery_attempts_delivery_attempt_idx").on(
      table.deliveryId,
      table.attempt,
    ),
    index("webhook_delivery_attempts_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
  ],
);

export type WebhookDeliveryAttempt =
  typeof webhookDeliveryAttempts.$inferSelect;

// ---------------------------------------------------------------------------
// Reporting: durable scheduled reports and delivery history
// ---------------------------------------------------------------------------

export const scheduledReports = pgTable(
  "scheduled_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reportType: text("report_type").notNull().default("hiring_overview"),
    frequency: text("frequency").notNull().default("monthly"),
    recipients: jsonb("recipients")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    filters: jsonb("filters")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    index("scheduled_reports_workspace_enabled_next_run_idx").on(
      table.workspaceId,
      table.enabled,
      table.nextRunAt,
    ),
  ],
);

export const scheduledReportRuns = pgTable(
  "scheduled_report_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scheduledReportId: uuid("scheduled_report_id")
      .notNull()
      .references(() => scheduledReports.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    recipientCount: integer("recipient_count").default(0).notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("scheduled_report_runs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("scheduled_report_runs_report_created_idx").on(
      table.scheduledReportId,
      table.createdAt,
    ),
  ],
);

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type NewScheduledReport = typeof scheduledReports.$inferInsert;
export type ScheduledReportRun = typeof scheduledReportRuns.$inferSelect;

// ---------------------------------------------------------------------------
// Advanced workspace security policy
// ---------------------------------------------------------------------------

export const securityReauthChallenges = pgTable(
  "security_reauth_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("security_reauth_challenges_token_hash_idx").on(
      table.tokenHash,
    ),
    index("security_reauth_challenges_user_workspace_idx").on(
      table.userId,
      table.workspaceId,
    ),
  ],
);

export type SecurityReauthChallenge =
  typeof securityReauthChallenges.$inferSelect;

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

// Candidate-facing, durable portal events. These are intentionally separate
// from recruiter in-app notifications, whose recipient is an internal user.
export const candidatePortalNotifications = pgTable(
  "candidate_portal_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    metadata: jsonb("metadata")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("candidate_portal_notifications_candidate_read_created_idx").on(
      table.candidateId,
      table.readAt,
      table.createdAt,
    ),
    index("candidate_portal_notifications_workspace_candidate_created_idx").on(
      table.workspaceId,
      table.candidateId,
      table.createdAt,
    ),
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
  "blocked",
  "completed",
  "denied",
]);

export const dsarTypeEnum = pgEnum("dsar_type", ["export", "erasure"]);

export const dsarRequests = pgTable(
  "dsar_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Preserve the request evidence after an erasure. The completed record
    // retains its workspace, requester, processor and timestamps.
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    type: dsarTypeEnum("type").notNull(),
    status: dsarStatusEnum("status").default("pending").notNull(),
    requestedBy: text("requested_by"),
    processedBy: text("processed_by"),
    notes: text("notes"),
    blockedReason: text("blocked_reason"),
    blockedBy: text("blocked_by"),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
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

export type CandidatePortalSession =
  typeof candidatePortalSessions.$inferSelect;
export type NewCandidatePortalSession =
  typeof candidatePortalSessions.$inferInsert;
export type CandidatePortalMagicLink =
  typeof candidatePortalMagicLinks.$inferSelect;

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
    // Set when the conversation is opened from a specific candidate's context,
    // so a candidate erasure (GDPR Art. 17) can cascade-delete the chat history
    // that embeds their PII. Null for general workspace copilot chats.
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "cascade",
    }),
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
    index("ai_conversations_candidate_idx").on(table.candidateId),
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
    parts: jsonb("parts")
      .default(sql`'[]'::jsonb`)
      .notNull(),
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

/**
 * Durable confirmation receipts for Harly AI write actions.
 *
 * The UI can retry a server action after a slow network response, so the
 * tool-call id is the stable idempotency key for one confirmation card. The
 * normalized input hash prevents a reused id from targeting a different
 * resource. Results are intentionally stored as the small normalized write
 * result, never as the full AI conversation or prompt.
 */
export const aiActionReceipts = pgTable(
  "ai_action_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actionId: text("action_id").notNull(),
    toolName: text("tool_name").notNull(),
    requestHash: text("request_hash").notNull(),
    // "processing" | "completed" | "failed"
    status: text("status").default("processing").notNull(),
    result: jsonb("result"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("ai_action_receipts_workspace_action_uidx").on(
      table.workspaceId,
      table.actionId,
    ),
    index("ai_action_receipts_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("ai_action_receipts_expires_idx").on(table.expiresAt),
  ],
);

export type AiConversation = typeof aiConversations.$inferSelect;

/**
 * Per-call AI token accounting (IA-04). One row per model invocation, so an
 * employer can see how much of their provider spend each surface consumed.
 * `workspaceId` is nullable because surfaces called outside an explicit
 * workspace scope (e.g. during intake) may not carry it; the provider/model/
 * surface columns are always present.
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_usage_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;

/**
 * Server-side OAuth state nonces. Each integration install creates a nonce
 * bound to the acting user + workspace; the provider redirects back to the
 * callback which redeems it. This is single-use, TTL-scoped, and ties the
 * callback to the actor who started the flow (not just the active workspace),
 * closing CSRF/replay/escalation on integration OAuth (F1-04 / F2-01 / F2-02).
 */
export const oauthStateNonces = pgTable(
  "oauth_state_nonces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("oauth_state_nonces_nonce_idx").on(table.nonce),
    index("oauth_state_nonces_ws_idx").on(table.workspaceId, table.provider),
  ],
);

export type OAuthStateNonce = typeof oauthStateNonces.$inferSelect;
export type NewOAuthStateNonce = typeof oauthStateNonces.$inferInsert;

/**
 * Shared fixed-window rate-limit buckets. Used by the database-backed
 * RateLimitStore so limits are enforced consistently across multiple app
 * instances (single-instance self-hosts use the in-memory store instead).
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("rate_limit_buckets_reset_idx").on(table.resetAt)],
);

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type NewRateLimitBucket = typeof rateLimitBuckets.$inferInsert;

// ---------------------------------------------------------------------------
// Workflow engine — visual automations (WHEN → IF → DO)
//
// A workflow is a rule: a trigger (a domain event + optional filter), a
// condition tree (AND/OR/NOT over candidate/application/job/ai fields), and a
// sequential list of actions. The shape is arbitrarily nested, so trigger /
// conditions / actions live in jsonb validated strictly by Zod at the edge
// (features/automations/schema.ts). `triggerEvent` is promoted to a real
// column so the dispatch path can index it cheaply on every emitted event.
// ---------------------------------------------------------------------------

/**
 * The definition of a workflow — the persistent rule. Runs with the
 * permissions of `createdById` (decision D1): the workflow acts in the name of
 * the recruiter who created it, until we migrate to a dedicated `automation`
 * role. If that user loses access, runs fail with a clear error (trade-off T1).
 */
export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").default(true).notNull(),
    // The triggering webhook event, promoted to a column for the dispatch index.
    // Kept in sync with `trigger.event` (validated at write time).
    triggerEvent: text("trigger_event").notNull(),
    // { event, filter? } — see automations/schema.ts TriggerSchema.
    trigger: jsonb("trigger")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    // Condition tree (leaf | and | or | not). Empty/absent = always match.
    conditions: jsonb("conditions")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    // Ordered list of { type, config } action descriptors.
    actions: jsonb("actions")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    // Dispatch hot path: on every emitted event, find enabled workflows for
    // this workspace listening to that event. Single index covers both filters.
    index("workflow_definitions_workspace_enabled_event_idx").on(
      table.workspaceId,
      table.enabled,
      table.triggerEvent,
    ),
    index("workflow_definitions_workspace_idx").on(table.workspaceId),
  ],
);

/**
 * Each execution of a workflow — the audit + debug + replay record. Inserted
 * with `status = 'running'` before the engine runs, so a crashed process leaves
 * a reclaimable row (same pattern as webhook_deliveries, trade-off T3).
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
    triggerEvent: text("trigger_event").notNull(),
    // The data payload of the emitted event that started this run.
    triggerPayload: jsonb("trigger_payload")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    // { matched, evaluated: [...] } — what the condition evaluator produced.
    conditionResult: jsonb("condition_result"),
    status: workflowRunStatusEnum("status").default("running").notNull(),
    // Stable source event identity prevents duplicate runs when a domain event
    // is delivered more than once or multiple web replicas race to dispatch it.
    sourceEventId: text("source_event_id"),
    // Durable worker state. A run is leased, heartbeated, and retried instead
    // of being executed optimistically by whichever process sees it first.
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    // Best-effort async: a stalled `running` row is reclaimed by the cron,
    // mirroring dispatchDueWebhooks. Used to detect re-entrant loops too.
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Parent run when this run was triggered by an action of another run
    // (loop-detection, FASE 2.4). Null for runs started directly by an event.
    parentRunId: uuid("parent_run_id"),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [
    index("workflow_runs_workspace_workflow_started_idx").on(
      table.workspaceId,
      table.workflowId,
      table.startedAt,
    ),
    index("workflow_runs_status_started_idx").on(table.status, table.startedAt),
    index("workflow_runs_parent_idx").on(table.parentRunId),
    index("workflow_runs_queue_idx").on(
      table.status,
      table.nextAttemptAt,
      table.lockedAt,
    ),
    uniqueIndex("workflow_runs_source_event_uidx").on(
      table.workspaceId,
      table.workflowId,
      table.sourceEventId,
    ),
  ],
);

/**
 * Granular per-action log inside a run — one row per executed action, with its
 * input and result. Powers the run timeline in the dashboard and replay.
 */
export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    // Nullable for backwards-compatible migration of historical steps. New
    // steps always set this deterministic action position.
    stepIndex: integer("step_index"),
    actionType: text("action_type").notNull(),
    actionInput: jsonb("action_input")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    // { success, error?, data? } — the action's normalized result.
    result: jsonb("result"),
    status: text("status").default("pending").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_run_steps_run_idx").on(table.runId),
    uniqueIndex("workflow_run_steps_run_step_uidx").on(
      table.runId,
      table.stepIndex,
    ),
  ],
);

/**
 * Workspace-level named secrets, encrypted at rest (AES-256-GCM, same scheme
 * as webhook endpoint secrets). Referenced from `http_request` actions as
 * `{{secrets.NAME}}` so secrets never sit in plaintext inside the actions
 * jsonb (trade-off T4). Write-once values; rotate by deleting + recreating.
 */
export const workspaceSecrets = pgTable(
  "workspace_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Encrypted value (ciphertext / iv / tag, all base64 — see lib/crypto).
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),
    description: text("description"),
    createdById: text("created_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("workspace_secrets_ws_name_idx").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type NewWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect;
export type NewWorkflowRunStep = typeof workflowRunSteps.$inferInsert;
export type WorkspaceSecret = typeof workspaceSecrets.$inferSelect;
export type NewWorkspaceSecret = typeof workspaceSecrets.$inferInsert;

export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
export type AiActionReceipt = typeof aiActionReceipts.$inferSelect;
export type NewAiActionReceipt = typeof aiActionReceipts.$inferInsert;
