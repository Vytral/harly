import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { candidates, db, jobs, organization, workspaceSettings } from "@harly/db";

import { getWorkspaceChatConfig, type ChatConfig } from "@/lib/notify/config";
import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { getWorkspaceTelegramConfig } from "@/lib/telegram/config";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@/server/webhooks/events";

/**
 * Chat notifications (Slack / Discord). Fire-and-forget: a broken or slow chat
 * webhook must never break the hiring flow that triggered it. Rides the same
 * emission points as outbound webhooks (see server/webhooks/emit.ts).
 */

const EVENT_EMOJI: Record<WebhookEvent, string> = {
  "application.created": "📥",
  "application.stage_changed": "↗️",
  "application.hired": "🎉",
  "application.rejected": "🚫",
  "candidate.created": "👤",
  "candidate.updated": "✏️",
  "interview.scheduled": "📅",
  "interview.canceled": "❌",
  "interview.completed": "✅",
  "interview.rescheduled": "🔄",
  "job.published": "📣",
};

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

type ChatField = { name: string; value: string; inline?: boolean };

type ChatBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  websiteUrl: string | null;
  hideHarlyBranding: boolean;
};

type Normalized = {
  emoji: string;
  title: string;
  detail: string | null;
  href: string;
  fields: ChatField[];
  branding: ChatBranding;
};

const DEFAULT_BRANDING: ChatBranding = {
  name: "Harly",
  logoUrl: null,
  primaryColor: "#2f6f4e",
  websiteUrl: null,
  hideHarlyBranding: false,
};

/** Best-effort extraction of a human label from a varied event payload. */
function describe(event: WebhookEvent, data: Record<string, unknown>): string | null {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;

  const who =
    (candidate?.name as string) ||
    (application?.candidateName as string) ||
    null;
  const role =
    (job?.title as string) ||
    (application?.jobTitle as string) ||
    null;

  if (event === "job.published") return role ? `“${role}” is now live` : null;
  if (interview?.title) return String(interview.title);
  if (who && role) return `${who} → ${role}`;
  return who ?? role ?? null;
}

function buildHref(event: WebhookEvent, data: Record<string, unknown>): string {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const candidateId = candidate?.id ?? application?.candidateId ?? interview?.candidateId;

  if (candidateId) return `${APP_URL}/dashboard/candidates/${encodeURIComponent(String(candidateId))}`;
  // Jobs currently have a shared dashboard view rather than a stable public
  // detail route. Keep this link valid until the job detail route is exposed.
  if (event === "job.published" && job?.id) return `${APP_URL}/dashboard/jobs`;
  return `${APP_URL}/dashboard`;
}

function buildFields(event: WebhookEvent, data: Record<string, unknown>): ChatField[] {
  const application = data.application as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const fields: ChatField[] = [];

  const jobTitle = (job?.title ?? application?.jobTitle) as string | undefined;
  if (jobTitle) fields.push({ name: "Role", value: jobTitle, inline: true });
  if (application?.status) {
    fields.push({ name: "Status", value: String(application.status), inline: true });
  }

  if (interview) {
    if (interview.scheduledAt) {
      fields.push({
        name: event === "interview.canceled" ? "Scheduled for" : "When",
        value: String(interview.scheduledAt),
        inline: true,
      });
    }
    if (interview.mode || interview.type) {
      fields.push({
        name: "Format",
        value: [interview.type, interview.mode].filter(Boolean).join(" · "),
        inline: true,
      });
    }
    if (interview.location) {
      fields.push({ name: "Location", value: String(interview.location), inline: true });
    }
  }

  return fields.slice(0, 6);
}

function hexToDiscordColor(value: string): number {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : 0x2f6f4e;
}

async function getWorkspaceChatBranding(workspaceId: string): Promise<ChatBranding> {
  const [row] = await db
    .select({
      name: organization.name,
      logoUrl: organization.logo,
      primaryColor: workspaceSettings.primaryColor,
      websiteUrl: workspaceSettings.websiteUrl,
      hideHarlyBranding: workspaceSettings.hideHarlyBranding,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(eq(organization.id, workspaceId))
    .limit(1);

  return {
    name: row?.name?.trim() || DEFAULT_BRANDING.name,
    logoUrl: row?.logoUrl
      ? row.logoUrl.startsWith("/")
        ? `${APP_URL}${row.logoUrl}`
        : row.logoUrl
      : null,
    primaryColor: row?.primaryColor ?? DEFAULT_BRANDING.primaryColor,
    websiteUrl: row?.websiteUrl ?? null,
    hideHarlyBranding: row?.hideHarlyBranding ?? false,
  };
}

async function enrichChatData(
  workspaceId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const candidateId = String(
    candidate?.id ?? application?.candidateId ?? interview?.candidateId ?? "",
  );
  const jobId = String(job?.id ?? application?.jobId ?? interview?.jobId ?? "");

  const [candidateRow, jobRow] = await Promise.all([
    candidateId
      ? db
          .select({ firstName: candidates.firstName, lastName: candidates.lastName })
          .from(candidates)
          .where(
            and(
              eq(candidates.workspaceId, workspaceId),
              eq(candidates.id, candidateId),
              isNull(candidates.deletedAt),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    jobId
      ? db
          .select({ title: jobs.title })
          .from(jobs)
          .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, jobId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    ...data,
    candidate:
      candidate ??
      (candidateRow[0]
        ? {
            id: candidateId,
            name: `${candidateRow[0].firstName} ${candidateRow[0].lastName}`.trim(),
          }
        : undefined),
    job:
      job ?? (jobRow[0] ? { id: jobId, title: jobRow[0].title } : undefined),
  };
}

function normalize(
  event: WebhookEvent,
  data: Record<string, unknown>,
  branding: ChatBranding = DEFAULT_BRANDING,
): Normalized {
  return {
    emoji: EVENT_EMOJI[event] ?? "🔔",
    title: WEBHOOK_EVENT_LABELS[event] ?? event,
    detail: describe(event, data),
    href: buildHref(event, data),
    fields: buildFields(event, data),
    branding,
  };
}

function slackPayload(n: Normalized): unknown {
  const line = n.detail ? `${n.emoji} *${n.title}* , ${n.detail}` : `${n.emoji} *${n.title}*`;
  return {
    text: `${n.title}${n.detail ? ` , ${n.detail}` : ""}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: line } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${n.href}|Open in Harly>` }],
      },
    ],
  };
}

function discordPayload(n: Normalized): unknown {
  const brandingFooter = n.branding.hideHarlyBranding
    ? n.branding.name
    : `${n.branding.name} · Powered by Harly`;
  return {
    username: n.branding.name.slice(0, 80),
    ...(n.branding.logoUrl ? { avatar_url: n.branding.logoUrl } : {}),
    embeds: [
      {
        title: `${n.emoji} ${n.title}`,
        description: n.detail ?? undefined,
        url: n.href,
        fields: n.fields,
        color: hexToDiscordColor(n.branding.primaryColor),
        footer: { text: brandingFooter },
        ...(n.branding.logoUrl ? { thumbnail: { url: n.branding.logoUrl } } : {}),
      },
    ],
    components: [
      {
        type: 1,
        components: [{ type: 2, style: 5, label: "Open in Harly", url: n.href }],
      },
    ],
  };
}

/** POST a single formatted message to the configured provider. */
export async function sendChatMessage(
  config: ChatConfig,
  event: WebhookEvent,
  data: Record<string, unknown>,
  branding: ChatBranding = DEFAULT_BRANDING,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const n = normalize(event, data, branding);
  const body = config.provider === "slack" ? slackPayload(n) : discordPayload(n);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "send failed" };
  }
}

/**
 * Notify a workspace's chat channel of a domain event, if it's enabled and
 * subscribed to that event. Never throws , failures are logged, not propagated.
 */
export async function notifyChatEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceChatConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;
    // OAuth Slack is the canonical Slack path. If both configurations exist,
    // prefer OAuth so one domain event cannot produce duplicate messages.
    if (config.provider === "slack" && await getWorkspaceSlackConfig(workspaceId)) return;
    const [enrichedData, branding] = await Promise.all([
      enrichChatData(workspaceId, data),
      getWorkspaceChatBranding(workspaceId),
    ]);
    const result = await sendChatMessage(config, event, enrichedData, branding);
    if (!result.ok) {
      console.error("[notify] chat send failed", {
        workspaceId,
        event,
        provider: config.provider,
        status: result.status,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[notify] chat notify failed", { workspaceId, event, error });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Telegram uses HTML parse mode; keep the same emoji/title/detail shape. */
export function telegramText(event: WebhookEvent, data: Record<string, unknown>): string {
  const n = normalize(event, data);
  const detail = n.detail ? ` , ${escapeHtml(n.detail)}` : "";
  return `${n.emoji} <b>${escapeHtml(n.title)}</b>${detail}\n<a href="${n.href}">Open in Harly</a>`;
}

/**
 * Notify a workspace's Telegram chat of a domain event, if it's enabled and
 * subscribed to that event. Never throws , failures are logged, not propagated.
 */
export async function notifyTelegramEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceTelegramConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;
    await sendTelegramMessage({
      botToken: config.botToken,
      chatId: config.chatId,
      text: telegramText(event, data),
    });
  } catch (error) {
    console.error("[notify] telegram notify failed", {
      workspaceId,
      event,
      error,
    });
  }
}
