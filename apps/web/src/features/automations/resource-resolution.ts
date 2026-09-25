import "server-only";

import { and, desc, eq, ilike, isNull, not, sql } from "drizzle-orm";
import {
  db,
  documents,
  emailTemplates,
  interviews,
  jobStages,
  jobs,
  member,
  offers,
  user,
  workflowDocumentTemplates,
  workflowWebhookEndpoints,
  workspaceSecrets,
} from "@harly/db";
import { requireActorPermission } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";
import { getIntegrationStatuses } from "@/features/workspaces/integrations-registry";
import { getWorkspaceCalConfig } from "@/lib/cal/config";
import { listCalEventTypes, verifyCalConnection } from "@/lib/cal/client";

export type AutomationResourceType =
  | "stage"
  | "member"
  | "email_template"
  | "document_template"
  | "document"
  | "webhook_secret"
  | "webhook_endpoint"
  | "interview"
  | "offer"
  | "cal_event_type"
  | "integration"
  | "job";

export type AutomationResourceItem = {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type ResolveAutomationResourcesInput = {
  workspaceId: string;
  actorId: string;
  resourceType: AutomationResourceType;
  query?: string;
  jobId?: string; // Optional context for stage resolution
  limit?: number;
  /** Opaque offset cursor returned by a previous lookup. */
  cursor?: string;
  permissions?: Permission[];
};

export type ResolveAutomationResourcesResult = {
  resourceType: AutomationResourceType;
  items: AutomationResourceItem[];
  nextCursor?: string;
  readiness?: {
    ready: boolean;
    missing: string[];
    message?: string;
  };
};

function encodeProviderCursor(cursor: string): string {
  return Buffer.from(`provider:${cursor}`, "utf8").toString("base64url");
}

function decodeProviderCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    return value.startsWith("provider:") ? value.slice("provider:".length) : undefined;
  } catch {
    return undefined;
  }
}

function decodeResourceCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function pageResources(
  resourceType: AutomationResourceType,
  items: AutomationResourceItem[],
  offset: number,
  limit: number,
): ResolveAutomationResourcesResult {
  const page = items.slice(offset, offset + limit);
  return {
    resourceType,
    items: page,
    ...(items.length > offset + limit
      ? { nextCursor: Buffer.from(String(offset + limit), "utf8").toString("base64url") }
      : {}),
  };
}

/**
 * Safely resolves workspace entities for automation design and configuration (AI09).
 * Enforces automations:manage permission.
 * NEVER exposes sensitive secret values: only authorized names, presence, and status.
 */
export async function resolveAutomationResources(
  input: ResolveAutomationResourcesInput,
): Promise<ResolveAutomationResourcesResult> {
  if (!input.permissions?.includes("automations:manage")) {
    await requireActorPermission(
      input.workspaceId,
      input.actorId,
      "automations:manage",
    );
  }

  const query = input.query?.trim();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = decodeResourceCursor(input.cursor);
  const queryLimit = Math.min(limit + offset + 1, 500);

  switch (input.resourceType) {
    case "stage": {
      const conditions = [eq(jobStages.workspaceId, input.workspaceId)];
      if (input.jobId) {
        conditions.push(eq(jobStages.jobId, input.jobId));
      }
      if (query) {
        conditions.push(
          ilike(
            jobStages.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: jobStages.id,
          name: jobStages.name,
          jobId: jobStages.jobId,
          order: jobStages.order,
        })
        .from(jobStages)
        .where(and(...conditions))
        .orderBy(jobStages.order)
        .limit(queryLimit);

      return pageResources("stage", rows.map((r) => ({
          id: r.id,
          name: r.name,
          metadata: { jobId: r.jobId, order: r.order },
        })), offset, limit);
    }

    case "member": {
      const conditions = [
        eq(member.organizationId, input.workspaceId),
        eq(member.status, "active"),
      ];
      if (query) {
        conditions.push(
          sql`(${ilike(user.name, `%${query}%`)} OR ${ilike(user.email, `%${query}%`)})`,
        );
      }
      const rows = await db
        .select({
          id: user.id,
          memberId: member.id,
          name: user.name,
          email: user.email,
          role: member.role,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(and(...conditions))
        .limit(queryLimit);

      return pageResources("member", rows.map((r) => ({
          id: r.id,
          name: r.name || r.email,
          description: r.email,
          metadata: { memberId: r.memberId, role: r.role },
        })), offset, limit);
    }

    case "email_template": {
      const conditions = [
        eq(emailTemplates.workspaceId, input.workspaceId),
        eq(emailTemplates.isActive, true),
      ];
      if (query) {
        conditions.push(
          ilike(
            emailTemplates.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: emailTemplates.id,
          name: emailTemplates.name,
          subject: emailTemplates.subject,
          type: emailTemplates.type,
        })
        .from(emailTemplates)
        .where(and(...conditions))
        .orderBy(desc(emailTemplates.updatedAt))
        .limit(queryLimit);

      return pageResources("email_template", rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.subject,
          metadata: { type: r.type },
        })), offset, limit);
    }

    case "document_template": {
      const conditions = [
        eq(workflowDocumentTemplates.workspaceId, input.workspaceId),
        isNull(workflowDocumentTemplates.archivedAt),
      ];
      if (query) {
        conditions.push(
          ilike(
            workflowDocumentTemplates.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: workflowDocumentTemplates.id,
          name: workflowDocumentTemplates.name,
          title: workflowDocumentTemplates.title,
          format: workflowDocumentTemplates.format,
        })
        .from(workflowDocumentTemplates)
        .where(and(...conditions))
        .orderBy(desc(workflowDocumentTemplates.updatedAt))
        .limit(queryLimit);

      return pageResources("document_template", rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.title,
          metadata: { format: r.format },
        })), offset, limit);
    }

    case "document": {
      const conditions = [
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "active"),
      ];
      if (query) {
        conditions.push(
          ilike(
            documents.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: documents.id,
          name: documents.name,
          mimeType: documents.mimeType,
          signatureStatus: documents.signatureStatus,
        })
        .from(documents)
        .where(and(...conditions))
        .limit(queryLimit);

      return pageResources("document", rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.mimeType,
          metadata: { signatureStatus: r.signatureStatus },
        })), offset, limit);
    }

    case "webhook_secret": {
      // Return ONLY secret names and descriptions. NEVER expose ciphertext, iv, or tag!
      const conditions = [eq(workspaceSecrets.workspaceId, input.workspaceId)];
      if (query) {
        conditions.push(
          ilike(
            workspaceSecrets.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          name: workspaceSecrets.name,
          description: workspaceSecrets.description,
        })
        .from(workspaceSecrets)
        .where(and(...conditions))
        .orderBy(workspaceSecrets.name)
        .limit(queryLimit);

      return pageResources("webhook_secret", rows.map((r) => ({
          id: r.name, // The secret name is the reference key used in HTTP action configurations
          name: r.name,
          description: r.description ?? undefined,
        })), offset, limit);
    }

    case "webhook_endpoint": {
      const conditions = [
        eq(workflowWebhookEndpoints.workspaceId, input.workspaceId),
        eq(workflowWebhookEndpoints.enabled, true),
      ];
      if (query) {
        conditions.push(
          ilike(
            workflowWebhookEndpoints.name,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: workflowWebhookEndpoints.id,
          name: workflowWebhookEndpoints.name,
          workflowId: workflowWebhookEndpoints.workflowId,
          payloadSchema: workflowWebhookEndpoints.payloadSchema,
          lastReceivedAt: workflowWebhookEndpoints.lastReceivedAt,
        })
        .from(workflowWebhookEndpoints)
        .where(and(...conditions))
        .limit(queryLimit);

      return pageResources("webhook_endpoint", rows.map((r) => ({
          id: r.id,
          name: r.name,
          metadata: {
            workflowId: r.workflowId,
            payloadSchema: r.payloadSchema,
            readiness: {
              ready: Boolean(r.workflowId && r.payloadSchema && typeof r.payloadSchema === "object"),
              missing: r.payloadSchema ? [] : ["payloadSchema"],
            },
            lastReceivedAt: r.lastReceivedAt?.toISOString(),
          },
        })), offset, limit);
    }

    case "interview": {
      const conditions = [
        eq(interviews.workspaceId, input.workspaceId),
        not(eq(interviews.status, "canceled")),
      ];
      if (query) {
        conditions.push(
          ilike(
            interviews.title,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: interviews.id,
          title: interviews.title,
          scheduledAt: interviews.scheduledAt,
          status: interviews.status,
          applicationId: interviews.applicationId,
          candidateId: interviews.candidateId,
          jobId: interviews.jobId,
        })
        .from(interviews)
        .where(and(...conditions))
        .orderBy(desc(interviews.scheduledAt))
        .limit(queryLimit);

      return pageResources("interview", rows.map((row) => ({
          id: row.id,
          name: row.title ?? `Interview on ${row.scheduledAt.toISOString()}`,
          metadata: {
            scheduledAt: row.scheduledAt.toISOString(),
            status: row.status,
            applicationId: row.applicationId,
            candidateId: row.candidateId,
            jobId: row.jobId,
          },
        })), offset, limit);
    }

    case "offer": {
      const conditions = [
        eq(offers.workspaceId, input.workspaceId),
        not(eq(offers.status, "withdrawn")),
      ];
      if (query) {
        conditions.push(
          ilike(
            offers.title,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: offers.id,
          title: offers.title,
          status: offers.status,
          applicationId: offers.applicationId,
          candidateId: offers.candidateId,
          jobId: offers.jobId,
        })
        .from(offers)
        .where(and(...conditions))
        .orderBy(desc(offers.updatedAt))
        .limit(queryLimit);

      return pageResources("offer", rows.map((row) => ({
          id: row.id,
          name: row.title,
          metadata: {
            status: row.status,
            applicationId: row.applicationId,
            candidateId: row.candidateId,
            jobId: row.jobId,
          },
        })), offset, limit);
    }

    case "cal_event_type": {
      const config = await getWorkspaceCalConfig(input.workspaceId);
      if (!config) {
        return {
          resourceType: "cal_event_type",
          items: [],
          readiness: {
            ready: false,
            missing: ["cal_api_key", "cal_connection"],
            message: "Connect Cal.com before selecting an event type.",
          },
        };
      }
      try {
        const page = await listCalEventTypes(config, {
          limit,
          cursor: decodeProviderCursor(input.cursor),
          query,
        });
        return {
          resourceType: "cal_event_type",
          items: page.items.map((item) => ({
            id: String(item.id),
            name: item.title,
            description: item.slug,
            metadata: {
              ...item.metadata,
              configured: String(item.id) === String(config.defaultEventTypeId ?? ""),
              readiness: {
                ready: true,
                missing: [],
              },
            },
          })),
          ...(page.nextCursor
            ? { nextCursor: encodeProviderCursor(page.nextCursor) }
            : {}),
          readiness: { ready: true, missing: [] },
        };
      } catch (error) {
        // Distinguish dead credentials from a transient listing failure so
        // the model asks to reconnect instead of retrying a broken key.
        try {
          await verifyCalConnection(config);
        } catch {
          return {
            resourceType: "cal_event_type",
            items: [],
            readiness: {
              ready: false,
              missing: ["cal_api_key", "cal_connection"],
              message: "The Cal.com connection is invalid. Reconnect Cal.com before selecting an event type.",
            },
          };
        }
        return {
          resourceType: "cal_event_type",
          items: [],
          readiness: {
            ready: false,
            missing: ["cal_event_types"],
            message:
              error instanceof Error
                ? `Cal.com event types are unavailable: ${error.message.slice(0, 240)}`
                : "Cal.com event types are unavailable.",
          },
        };
      }
    }

    case "integration": {
      const statuses = await getIntegrationStatuses(input.workspaceId);
      const integrations: AutomationResourceItem[] = [
        {
          id: "slack",
          name: "Slack",
          description: "Team notifications",
          metadata: { connected: statuses.slack.enabled },
        },
        {
          id: "telegram",
          name: "Telegram",
          description: "Telegram bot notifications",
          metadata: { connected: statuses.telegram.hasToken },
        },
        {
          id: "discord",
          name: "Discord",
          description: "Discord webhook notifications",
          metadata: {
            connected:
              statuses.chat.provider === "discord" && statuses.chat.hasWebhook,
          },
        },
        {
          id: "cal",
          name: "Cal.com",
          description: "Candidate booking links",
          metadata: { connected: statuses.cal.enabled },
        },
        {
          id: "gcal",
          name: "Google Calendar & Meet",
          description: "Calendar & Video sync",
          metadata: { connected: statuses.gcal.enabled },
        },
        {
          id: "outlook",
          name: "Microsoft Outlook & Teams",
          description: "Calendar, Mail & Video sync",
          metadata: { connected: statuses.outlook.enabled },
        },
        {
          id: "zoom",
          name: "Zoom",
          description: "Video meetings",
          metadata: {
            connected: statuses.zoom.installationState === "installed",
          },
        },
        {
          id: "jitsi",
          name: "Jitsi Meet",
          description: "Self-hosted video meetings",
          metadata: {
            connected:
              statuses.jitsi.enabled && Boolean(statuses.jitsi.baseUrl),
          },
        },
        {
          id: "docuseal",
          name: "DocuSeal",
          description: "E-signature provider",
          metadata: {
            connected: statuses.docuseal.enabled && statuses.docuseal.hasToken,
          },
        },
        {
          id: "harly-sign",
          name: "Harly Sign",
          description: "Native in-app e-signatures",
          metadata: { connected: true },
        },
        {
          id: "email",
          name: "Email delivery",
          description: "Durable candidate email outbox",
          metadata: {
            connected:
              statuses.email.enabled || statuses.email.usingPlatformDefault,
            provider: statuses.email.provider,
          },
        },
        {
          id: "meeting_provider",
          name: "Meeting provider",
          description:
            "At least one connected interview scheduling/video provider",
          metadata: {
            connected:
              statuses.cal.enabled ||
              statuses.gcal.enabled ||
              statuses.outlook.enabled ||
              statuses.zoom.installationState === "installed" ||
              (statuses.jitsi.enabled && Boolean(statuses.jitsi.baseUrl)),
          },
        },
      ];

      const filtered = query
        ? integrations.filter(
            (i) =>
              i.name.toLowerCase().includes(query.toLowerCase()) ||
              i.id.toLowerCase().includes(query.toLowerCase()),
          )
        : integrations;

      return pageResources("integration", filtered, offset, limit);
    }

    case "job": {
      const conditions = [
        eq(jobs.workspaceId, input.workspaceId),
        isNull(jobs.deletedAt),
      ];
      if (query) {
        conditions.push(
          ilike(
            jobs.title,
            `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
          ),
        );
      }
      const rows = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          status: jobs.status,
          department: jobs.department,
        })
        .from(jobs)
        .where(and(...conditions))
        .orderBy(desc(jobs.updatedAt))
        .limit(queryLimit);

      return pageResources("job", rows.map((r) => ({
          id: r.id,
          name: r.title,
          metadata: { status: r.status, department: r.department },
        })), offset, limit);
    }

    default: {
      return { resourceType: input.resourceType, items: [] };
    }
  }
}
