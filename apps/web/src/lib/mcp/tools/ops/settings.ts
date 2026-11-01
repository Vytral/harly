import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";
import { normalizeCareerPageConfig } from "@/features/career-page/config";
import {
  getWorkspaceAuditLogs,
  getWorkspaceSecuritySettings,
} from "@/features/security/data";
import { getAssistantBranding } from "@/lib/ai/assistant-branding";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getWorkspaceEmailStatus, getWorkspaceInboundEmailStatus } from "@/lib/email/config";
import { getMailboxStatus } from "@/lib/mailbox/config";
import { listApiKeys, listWebhookEndpoints, serializeApiKey, serializeWebhookEndpoint } from "@/features/developers/data";
import {
  addRejectionReasonAction,
  renameRejectionReasonAction,
  setRejectionReasonArchivedAction,
} from "@/features/rejection-reasons/actions";
import { listRejectionReasons } from "@/features/rejection-reasons/data";
import { isUnrestrictedScope } from "@/features/search/scope";
import {
  cancelWorkspaceInvitationAction,
  inviteWorkspaceMembersAction,
  resendWorkspaceInvitationAction,
  updateWorkspaceBoardBrandingAction,
  updateWorkspaceProfileAction,
} from "@/features/workspaces/actions";
import { getWorkspaceSettingsData } from "@/features/workspaces/data";
import { getLegalSettingsData } from "@/features/workspaces/legal-settings-actions";
import { savePortalSettingsAction, savePortalUiOptionsAction } from "@/features/workspaces/portal-settings-actions";
import { CATEGORY_LABELS, getIntegrationStatuses, INTEGRATIONS, isConnected } from "@/features/workspaces/integrations-registry";
import { getRolePolicy, listWorkspaceRoles, requirePermission } from "@/features/workspaces/permissions-server";
import { isValidTimeZone } from "@/features/reports/window";

import { defineMcpTool, McpToolError, type McpToolDefinition } from "../../types";
import { appLink, assertActionOk, boundJson, isoOrNull, matchesQuery, pageFields, paginateArray, redactSecrets } from "./shared";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Drop user:password@ from a URL before it is shown to the model. */
export function stripUrlCredentials(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

/** Build a FormData from plain values (server actions in Harly take FormData). Undefined entries are skipped. */
export function buildFormData(values: Record<string, string | boolean | null | undefined>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    form.set(key, value === null ? "" : String(value));
  }
  return form;
}

/** Fields that need the board-branding action. */
const BRANDING_KEYS = ["tagline", "description", "websiteUrl", "primaryColor"] as const;
/** Fields that need the workspace-profile action. */
const PROFILE_KEYS = ["name", "timezone"] as const;

/** Decide which underlying actions a company update needs. Pure; exported for tests. */
export function companyUpdatePlan(input: Partial<Record<(typeof BRANDING_KEYS)[number] | (typeof PROFILE_KEYS)[number], unknown>>) {
  return {
    profile: PROFILE_KEYS.some((key) => input[key] !== undefined),
    branding: BRANDING_KEYS.some((key) => input[key] !== undefined),
  };
}

type PrevState = { success: boolean };
const INITIAL: PrevState = { success: false };

async function loadSettingsRow(workspaceId: string) {
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.organizationId, workspaceId)).limit(1);
  return row ?? null;
}

export const settingsTools: McpToolDefinition[] = [
  // ----- Reads ---------------------------------------------------------------
  defineMcpTool({
    name: "settings_company_get",
    title: "Company profile and branding",
    description:
      "Workspace profile as in Settings > Company: name, slug, logo URL, tagline, description, website, brand color, public board style, reporting time zone (IANA; empty = UTC), whether candidate Gravatar pictures are on. Read-only; change with settings_company_update.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const { branding } = await getWorkspaceSettingsData();
      return { ...branding, url: appLink(ctx.appOrigin, "/settings") };
    },
  }),

  defineMcpTool({
    name: "settings_email_get",
    title: "Email sending and reply settings",
    description:
      "How the workspace sends and receives email: outbound provider, sender address, whether a secret is stored (never the secret), SMTP host/port, inbound reply-by-email domain and provider, and the connected mailbox (address, folders, last sync, last error). Use to diagnose why email is not sending.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const [outbound, inbound, mailbox] = await Promise.all([
        getWorkspaceEmailStatus(ctx.workspaceId),
        getWorkspaceInboundEmailStatus(ctx.workspaceId),
        getMailboxStatus(ctx.workspaceId),
      ]);
      return {
        outbound: {
          enabled: outbound.enabled,
          provider: outbound.provider,
          from: outbound.from,
          hasSecret: outbound.hasSecret,
          smtpHost: outbound.smtpHost,
          smtpPort: outbound.smtpPort,
          smtpSecure: outbound.smtpSecure,
          usingPlatformDefault: outbound.usingPlatformDefault,
          encryptionReady: outbound.encryptionReady,
        },
        inbound: {
          enabled: inbound.enabled,
          provider: inbound.provider,
          replyDomain: inbound.replyDomain,
          hasWebhookSecret: inbound.hasWebhookSecret,
        },
        mailbox: {
          configured: mailbox.configured,
          enabled: mailbox.enabled,
          address: mailbox.address,
          imapHost: mailbox.imapHost,
          sourceFolder: mailbox.sourceFolder,
          sentFolder: mailbox.sentFolder,
          smtpHost: mailbox.smtpHost,
          lastSyncedAt: mailbox.lastSyncedAt,
          lastHealthyAt: mailbox.lastHealthyAt,
          lastError: mailbox.lastError,
        },
        url: appLink(ctx.appOrigin, "/settings/email"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_ai_get",
    title: "AI provider settings",
    description:
      "Workspace AI configuration: enabled, provider, model id, base URL (credentials stripped), whether an API key is stored (the key is never returned), and the privacy toggles auto-score, duplicate check and resume anonymization; plus the AI assistant's display name/branding.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const [status, branding] = await Promise.all([getWorkspaceAiStatus(ctx.workspaceId), getAssistantBranding(ctx.workspaceId)]);
      return {
        enabled: status.enabled,
        provider: status.provider,
        modelId: status.modelId,
        baseUrl: stripUrlCredentials(status.baseUrl),
        hasApiKey: status.hasApiKey,
        autoScore: status.autoScore,
        duplicateCheck: status.duplicateCheck,
        resumeAnonymization: status.resumeAnonymization,
        assistantBranding: boundJson(redactSecrets(branding), { maxString: 200, maxDepth: 3 }),
        url: appLink(ctx.appOrigin, "/settings/ai"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_portal_get",
    title: "Candidate portal settings",
    description: "Candidate portal state: enabled, whether Google / GitHub / LinkedIn sign-in is configured (no secrets), and which details candidates see (application status, hiring team). Change with settings_portal_update.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const [row, email] = await Promise.all([loadSettingsRow(ctx.workspaceId), getWorkspaceEmailStatus(ctx.workspaceId)]);
      return {
        enabled: row?.candidatePortalEnabled ?? false,
        emailConfigured: email.enabled,
        signIn: {
          google: Boolean(row?.portalGoogleClientId && row?.portalGoogleClientSecretCiphertext),
          github: Boolean(row?.portalGithubClientId && row?.portalGithubClientSecretCiphertext),
          linkedin: Boolean(row?.portalLinkedinClientId && row?.portalLinkedinClientSecretCiphertext),
        },
        showApplicationStatus: row?.portalShowApplicationStatus ?? true,
        showHiringTeam: row?.portalShowHiringTeam ?? false,
        url: appLink(ctx.appOrigin, "/settings/portal"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_career_page_get",
    title: "Career page summary",
    description: "Summary of the public career page configuration: template, hero headline, which sections are enabled (gallery, values, testimonials, FAQ, process, CTA), theme and SEO flags. Editing the career page is done in the web app (Settings > Career page).",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const row = await loadSettingsRow(ctx.workspaceId);
      const config = normalizeCareerPageConfig(row?.careerPageConfig);
      return {
        configured: config.template !== "",
        template: config.template || null,
        hero: { headline: config.hero.headline, subhead: config.hero.subhead, ctaButtonText: config.hero.ctaButtonText },
        sections: {
          overview: config.overview.enabled,
          gallery: config.gallery.enabled,
          values: config.values.enabled,
          testimonials: config.testimonials.enabled,
          faq: config.faq.enabled,
          process: config.process?.enabled ?? false,
          cta: config.cta.enabled,
        },
        counts: {
          values: config.values.items.length,
          testimonials: config.testimonials.items.length,
          faqItems: config.faq.items.length,
          processSteps: config.process?.steps.length ?? 0,
          socials: config.footer.socials.length,
        },
        theme: config.theme,
        seo: { indexable: config.seo.indexable, title: config.seo.title, description: config.seo.description },
      };
    },
  }),

  defineMcpTool({
    name: "settings_legal_get",
    title: "Legal and compliance settings",
    description:
      "Legal entity (name, address, contact, DPO email, jurisdiction), data-retention policy (months, enabled), audit-log retention, the consent checkbox text and which public legal pages exist (privacy, terms, cookies, candidate notice, AI transparency). Page bodies are only returned when includePageText=true.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({ includePageText: z.boolean().default(false).describe("Also return the text of each legal page (can be long).") }),
    async run(input) {
      const data = await getLegalSettingsData();
      const pages = Object.entries(data.legalPages ?? {}).map(([key, text]) => ({
        key,
        characters: typeof text === "string" ? text.length : 0,
        ...(input.includePageText ? { text: typeof text === "string" ? text : "" } : {}),
      }));
      const { legalPages: _legalPages, ...rest } = data;
      void _legalPages;
      return { ...rest, pages };
    },
  }),

  defineMcpTool({
    name: "settings_signature_get",
    title: "E-signature settings",
    description: "Native e-signature configuration: whether Harly Sign and remote signing are enabled, OTP and security mode, expiration and reminder cadence, saved/vector signatures and the signing timeline.",
    group: "settings",
    scope: "settings:read",
    permission: "settings:edit",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const row = await loadSettingsRow(ctx.workspaceId);
      return {
        nativeSignEnabled: row?.nativeSignEnabled ?? true,
        remoteSignEnabled: row?.remoteSignEnabled ?? false,
        savedSignaturesEnabled: row?.savedSignaturesEnabled ?? false,
        vectorSignaturesEnabled: row?.vectorSignaturesEnabled ?? false,
        signatureOtpEnabled: row?.signatureOtpEnabled ?? false,
        signatureTimelineEnabled: row?.signatureTimelineEnabled ?? false,
        signatureSecurityMode: row?.signatureSecurityMode ?? "link_only",
        signatureExpirationDays: row?.signatureExpirationDays ?? 30,
        signatureReminderCadenceDays: row?.signatureReminderCadenceDays ?? 3,
        signatureMaxReminders: row?.signatureMaxReminders ?? 3,
      };
    },
  }),

  defineMcpTool({
    name: "settings_rejection_reasons_list",
    title: "Rejection reasons catalog",
    description: "The workspace's rejection reasons in display order (code + label). Use the code when rejecting an application. Pass includeArchived=true to also see retired reasons.",
    group: "settings",
    scope: "settings:read",
    permission: null,
    annotations: READ,
    input: z.object({ includeArchived: z.boolean().default(false).describe("Include archived reasons.") }),
    async run(input, ctx) {
      const reasons = await listRejectionReasons(ctx.workspaceId, { includeArchived: input.includeArchived });
      return { reasons };
    },
  }),

  defineMcpTool({
    name: "settings_integrations_status",
    title: "Integration connection status",
    description: "Every integration the marketplace offers (calendars, video meetings, Slack, e-sign, captcha, automation...) with whether it is connected for this workspace and its health. Never returns tokens or secrets.",
    group: "settings",
    scope: "settings:read",
    permission: "integrations:manage",
    annotations: READ,
    input: z.object({ connectedOnly: z.boolean().default(false).describe("Only connected integrations.") }),
    async run(input, ctx) {
      const statuses = await getIntegrationStatuses(ctx.workspaceId);
      const items = INTEGRATIONS.map((integration) => ({
        slug: integration.slug,
        name: integration.name,
        category: CATEGORY_LABELS[integration.category],
        description: integration.description,
        comingSoon: Boolean(integration.comingSoon),
        connected: isConnected(integration.slug, statuses),
      })).filter((item) => !input.connectedOnly || item.connected);
      return {
        integrations: items,
        health: boundJson(redactSecrets(statuses.health), { maxString: 200, maxDepth: 3 }),
        url: appLink(ctx.appOrigin, "/settings/integrations"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_security_summary",
    title: "Security settings summary",
    description:
      "READ-ONLY summary of workspace security policy: whether 2FA is required, passkeys required, risk detection, re-authentication interval, number of allowed IP ranges and the allowed email domains. Security policies, SSO and 2FA can only be changed in the web app by the owner.",
    group: "settings",
    scope: "settings:read",
    permission: "security:manage",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const settings = await getWorkspaceSecuritySettings(ctx.workspaceId);
      return {
        require2fa: settings.require2fa,
        requirePasskey: settings.requirePasskey,
        riskDetectionEnabled: settings.riskDetectionEnabled,
        reauthMinutes: settings.reauthMinutes,
        ipAllowlistEntries: settings.ipAllowlist.length,
        allowedEmailDomains: settings.allowedDomains,
        url: appLink(ctx.appOrigin, "/settings/security"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_developers_summary",
    title: "API keys and webhooks overview",
    description:
      "Metadata of the workspace's API keys (name, type, environment, prefix and last 4 characters, scopes, last used, expiry, revoked) and outgoing webhook endpoints (URL, events, enabled). Key values and webhook secrets are NEVER returned, and keys cannot be created or rotated through MCP.",
    group: "settings",
    scope: "settings:read",
    permission: "integrations:manage",
    annotations: READ,
    input: z.object({}),
    async run(_input, ctx) {
      const [keys, endpoints] = await Promise.all([listApiKeys(ctx.workspaceId), listWebhookEndpoints(ctx.workspaceId)]);
      return {
        apiKeys: keys.map(serializeApiKey),
        webhooks: endpoints.map(serializeWebhookEndpoint),
        url: appLink(ctx.appOrigin, "/settings/developers"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_members_list",
    title: "List members and invitations",
    description:
      "Workspace members (name, email, role key, department / region / team, status, job title) and pending invitations. Filter by name, email or role. Role keys match settings_roles_list. Use settings_members_invite to add people.",
    group: "settings",
    scope: "settings:read",
    permission: "members:read",
    annotations: READ,
    input: z.object({
      query: z.string().trim().max(120).optional().describe("Match name or email."),
      role: z.string().trim().max(60).optional().describe("Only this role key."),
      includeInvitations: z.boolean().default(true).describe("Also return invitations (first page of members only)."),
      ...pageFields,
    }),
    async run(input, ctx) {
      const { members, invitations } = await getWorkspaceSettingsData();
      const filtered = members.filter((member) => (!input.role || member.role === input.role) && matchesQuery(input.query, member.name, member.email));
      const page = paginateArray(filtered, input.limit, input.offset);
      return {
        ...page,
        items: page.items.map((member) => ({
          memberId: member.id,
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          jobTitle: member.jobTitle ?? null,
          department: member.department,
          region: member.region,
          team: member.team,
          status: member.status,
          isYou: member.isCurrentUser,
          joinedAt: isoOrNull(member.createdAt),
        })),
        ...(input.includeInvitations && input.offset === 0
          ? {
              invitations: invitations.map((invitation) => ({
                invitationId: invitation.id,
                email: invitation.email,
                role: invitation.role,
                status: invitation.status,
                expiresAt: isoOrNull(invitation.expiresAt),
                createdAt: isoOrNull(invitation.createdAt),
              })),
            }
          : {}),
        url: appLink(ctx.appOrigin, "/settings/members"),
      };
    },
  }),

  defineMcpTool({
    name: "settings_roles_list",
    title: "List roles and permissions",
    description: "All roles (built-in owner / admin / recruiter / hiring manager and custom ones) with the permissions each grants, the access scope (all jobs or assigned only, departments, regions) and member counts. Use role keys for settings_members_invite.",
    group: "settings",
    scope: "settings:read",
    permission: "members:read",
    annotations: READ,
    input: z.object({}),
    async run() {
      const roles = await listWorkspaceRoles();
      return {
        roles: roles.map((role) => ({
          key: role.key,
          name: role.name,
          builtIn: role.isBuiltin,
          editable: role.editable,
          memberCount: role.memberCount,
          scope: role.scope,
          permissions: role.permissions,
        })),
      };
    },
  }),

  defineMcpTool({
    name: "settings_audit_log_list",
    title: "Read the audit log",
    description:
      "Security audit log, newest first: who did what (action, resource type and id, severity, time, actor email) with sanitized metadata. Filter by free text, action, resource type, severity and a date range. Same access as Settings > Security: needs the security permission and an unrestricted role scope. IP addresses and user agents are not returned.",
    group: "settings",
    scope: "settings:read",
    permission: "security:manage",
    annotations: READ,
    input: z.object({
      query: z.string().trim().max(120).optional().describe("Free text over action, actor email and resource type."),
      action: z.string().trim().max(120).optional().describe("Action substring, e.g. member.invited or task.deleted."),
      resourceType: z.string().trim().max(80).optional().describe("Resource type substring, e.g. workflow."),
      severity: z.enum(["info", "warning", "critical"]).optional().describe("Only this severity."),
      from: z.string().datetime().optional().describe("Only events at or after this ISO timestamp."),
      to: z.string().datetime().optional().describe("Only events at or before this ISO timestamp."),
      limit: pageFields.limit,
    }),
    async run(input) {
      const context = await requirePermission("security:manage");
      const policy = await getRolePolicy(context.organization.id, context.roleKey);
      if (!isUnrestrictedScope(policy.scope)) {
        throw new McpToolError("The audit log requires an unrestricted role scope.", "forbidden");
      }
      const rows = await getWorkspaceAuditLogs(context.organization.id, {
        query: input.query,
        action: input.action,
        resourceType: input.resourceType,
        severity: input.severity,
        from: input.from ? new Date(input.from) : undefined,
        to: input.to ? new Date(input.to) : undefined,
        limit: input.limit,
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          at: row.createdAt,
          action: row.action,
          severity: row.severity,
          actorEmail: row.actorEmail,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          metadata: row.metadata,
        })),
      };
    },
  }),

  // ----- Writes --------------------------------------------------------------
  defineMcpTool({
    name: "settings_company_update",
    title: "Update company profile",
    description:
      "Change the workspace name, reporting time zone, tagline, description, website or brand color. Only the fields you pass change; send an empty string to clear tagline / description / website / color or to reset the time zone to UTC. Logos, images and board style are not editable here (use the web app). Returns the updated profile.",
    group: "settings",
    scope: "settings:write",
    permission: "settings:edit",
    annotations: WRITE_IDEMPOTENT,
    input: z.object({
      name: z.string().trim().min(1).max(120).optional().describe("Workspace name."),
      timezone: z.string().trim().max(64).optional().describe("IANA time zone for reports, e.g. America/Santiago. Empty string = UTC."),
      tagline: z.string().trim().max(200).optional().describe("Short tagline shown on the public board."),
      description: z.string().trim().max(2000).optional().describe("Company description on the public board."),
      websiteUrl: z.string().trim().max(300).optional().describe("Company website URL (https://...)."),
      primaryColor: z.string().trim().max(20).optional().describe("Brand color as hex, e.g. #4f46e5."),
    }),
    async run(input, ctx) {
      const plan = companyUpdatePlan(input);
      if (!plan.profile && !plan.branding) throw new McpToolError("Pass at least one field to change.", "invalid_input");
      if (input.timezone && !isValidTimeZone(input.timezone)) {
        throw new McpToolError("Choose a valid IANA time zone, e.g. Europe/Madrid.", "invalid_input");
      }
      const { branding: current } = await getWorkspaceSettingsData();
      if (plan.profile) {
        const result = await updateWorkspaceProfileAction(
          INITIAL as never,
          buildFormData({
            name: input.name ?? current.name,
            logoUrl: current.logoUrl ?? "",
            sidebarLogoStyle: current.sidebarLogoStyle,
            sidebarLogoUrl: current.sidebarLogoUrl ?? "",
            sidebarLogoDarkUrl: current.sidebarLogoDarkUrl ?? "",
            timezone: input.timezone ?? current.timezone ?? "",
          }),
        );
        assertActionOk(result, "Could not update the workspace profile.");
      }
      if (plan.branding) {
        const result = await updateWorkspaceBoardBrandingAction(
          INITIAL as never,
          buildFormData({
            tagline: input.tagline ?? current.tagline ?? "",
            description: input.description ?? current.description ?? "",
            websiteUrl: input.websiteUrl ?? current.websiteUrl ?? "",
            primaryColor: input.primaryColor ?? current.primaryColor ?? "",
            heroImageUrl: current.heroImageUrl ?? "",
            boardStyle: current.boardStyle,
            logoStyle: current.logoStyle,
            hideHarlyBranding: current.hideHarlyBranding,
          }),
        );
        assertActionOk(result, "Could not update the board branding.");
      }
      const { branding } = await getWorkspaceSettingsData();
      return { ...branding, url: appLink(ctx.appOrigin, "/settings") };
    },
  }),

  defineMcpTool({
    name: "settings_portal_update",
    title: "Update candidate portal settings",
    description:
      "Turn the candidate portal on or off and choose what candidates see (application status, hiring team). Only passed fields change. Portal sign-in credentials (Google / GitHub / LinkedIn) cannot be set through MCP.",
    group: "settings",
    scope: "settings:write",
    permission: "settings:edit",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      enabled: z.boolean().optional().describe("Enable or disable the candidate portal."),
      showApplicationStatus: z.boolean().optional().describe("Let candidates see their application status."),
      showHiringTeam: z.boolean().optional().describe("Let candidates see the hiring team."),
    }),
    async run(input, ctx) {
      if (input.enabled === undefined && input.showApplicationStatus === undefined && input.showHiringTeam === undefined) {
        throw new McpToolError("Pass at least one field to change.", "invalid_input");
      }
      const row = await loadSettingsRow(ctx.workspaceId);
      if (input.enabled !== undefined) assertActionOk(await savePortalSettingsAction(input.enabled), "Could not update the portal.");
      if (input.showApplicationStatus !== undefined || input.showHiringTeam !== undefined) {
        assertActionOk(
          await savePortalUiOptionsAction({
            showApplicationStatus: input.showApplicationStatus ?? row?.portalShowApplicationStatus ?? true,
            showHiringTeam: input.showHiringTeam ?? row?.portalShowHiringTeam ?? false,
          }),
          "Could not update the portal options.",
        );
      }
      const updated = await loadSettingsRow(ctx.workspaceId);
      return {
        enabled: updated?.candidatePortalEnabled ?? false,
        showApplicationStatus: updated?.portalShowApplicationStatus ?? true,
        showHiringTeam: updated?.portalShowHiringTeam ?? false,
      };
    },
  }),

  defineMcpTool({
    name: "settings_rejection_reason_add",
    title: "Add a rejection reason",
    description: "Add a reason to the rejection catalog (shown when rejecting candidates). The code is generated from the label. Fails if a reason with the same label exists.",
    group: "settings",
    scope: "settings:write",
    permission: "settings:edit",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({ label: z.string().trim().min(1).max(80).describe("Reason label, e.g. Salary expectations too high.") }),
    async run(input, ctx) {
      assertActionOk(await addRejectionReasonAction(input.label), "Could not add the reason.");
      const reasons = await listRejectionReasons(ctx.workspaceId, { includeArchived: true });
      return { reasons };
    },
  }),

  defineMcpTool({
    name: "settings_rejection_reason_rename",
    title: "Rename a rejection reason",
    description: "Change the label of a rejection reason (code from settings_rejection_reasons_list). Existing rejections keep their code and show the new label.",
    group: "settings",
    scope: "settings:write",
    permission: "settings:edit",
    annotations: WRITE_IDEMPOTENT,
    input: z.object({
      code: z.string().trim().min(1).max(64).describe("Reason code."),
      label: z.string().trim().min(1).max(80).describe("New label."),
    }),
    async run(input, ctx) {
      assertActionOk(await renameRejectionReasonAction(input.code, input.label), "Could not rename the reason.");
      return { reasons: await listRejectionReasons(ctx.workspaceId, { includeArchived: true }) };
    },
  }),

  defineMcpTool({
    name: "settings_rejection_reason_archive",
    title: "Archive or restore a rejection reason",
    description: "Archive a rejection reason so it no longer appears in the reject dialog (history is kept), or restore it with archived=false. At least one active reason must remain.",
    group: "settings",
    scope: "settings:write",
    permission: "settings:edit",
    annotations: WRITE_IDEMPOTENT,
    input: z.object({
      code: z.string().trim().min(1).max(64).describe("Reason code."),
      archived: z.boolean().default(true).describe("true = archive, false = restore."),
    }),
    async run(input, ctx) {
      assertActionOk(await setRejectionReasonArchivedAction(input.code, input.archived), "Could not update the reason.");
      return { reasons: await listRejectionReasons(ctx.workspaceId, { includeArchived: true }) };
    },
  }),

  defineMcpTool({
    name: "settings_members_invite",
    title: "Invite teammates",
    description:
      "Invite people to the workspace by email with a role key (settings_roles_list). Existing Harly users are added right away; new people get an invitation email (this sends real email). The Owner role cannot be granted by invite, and you cannot grant a role above your own. Returns how many were invited or added and which emails were skipped and why.",
    group: "settings",
    scope: "settings:write",
    permission: "members:invite",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    input: z.object({
      invites: z
        .array(
          z.object({
            email: z.string().trim().email().describe("Email address to invite."),
            role: z.string().trim().min(1).describe("Role key, e.g. recruiter or hiring_manager."),
          }),
        )
        .min(1)
        .max(50)
        .describe("People to invite (max 50 per call)."),
    }),
    async run(input) {
      const result = await inviteWorkspaceMembersAction(
        { success: false } as never,
        buildFormData({ invites: JSON.stringify(input.invites) }),
      );
      assertActionOk(result, "Could not send invitations.");
      return { sent: result.sent ?? 0, added: result.added ?? 0, skipped: result.skipped ?? [] };
    },
  }),

  defineMcpTool({
    name: "settings_invitation_resend",
    title: "Resend an invitation",
    description: "Resend a pending invitation email and extend its expiry by 7 days (invitationId from settings_members_list). Sends real email.",
    group: "settings",
    scope: "settings:write",
    permission: "members:invite",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    input: z.object({ invitationId: z.string().min(1).describe("Pending invitation id.") }),
    async run(input) {
      assertActionOk(await resendWorkspaceInvitationAction(input.invitationId), "Could not resend the invitation.");
      return { resent: true, invitationId: input.invitationId };
    },
  }),

  defineMcpTool({
    name: "settings_invitation_cancel",
    title: "Cancel an invitation",
    description: "Cancel a pending invitation so its link no longer works (invitationId from settings_members_list).",
    group: "settings",
    scope: "settings:write",
    permission: "members:invite",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({ invitationId: z.string().min(1).describe("Pending invitation id.") }),
    async run(input) {
      assertActionOk(await cancelWorkspaceInvitationAction(input.invitationId), "Could not cancel the invitation.");
      return { canceled: true, invitationId: input.invitationId };
    },
  }),
];
