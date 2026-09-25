import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { candidates, db, jobs, organization, workspaceSettings } from "@harly/db";

import { getWorkspaceChatConfig, type ChatConfig } from "@/lib/notify/config";
import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { getWorkspaceTelegramConfig } from "@/lib/telegram/config";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { isDemoMode } from "@harly/config";

import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@/server/webhooks/events";

/**
 * Chat notifications (Slack / Discord). Fire-and-forget: a broken or slow chat
 * webhook must never break the hiring flow that triggered it. Rides the same
 * emission points as outbound webhooks (see server/webhooks/emit.ts).
 */

const EVENT_EMOJI: Partial<Record<WebhookEvent, string>> = {
  "application.created": "📥",
  "application.stage_changed": "↗️",
  "application.hired": "🎉",
  "application.rejected": "🚫",
  "candidate.created": "👤",
  "candidate.updated": "✏️",
  "candidate.referred": "🙌",
  "candidate.referral_deleted": "🗑️",
  "interview.scheduled": "📅",
  "interview.canceled": "❌",
  "interview.completed": "✅",
  "interview.rescheduled": "🔄",
  "task.completed": "✅",
  "job.published": "📣",
  "webhook.received": "↔️",
};

const APP_URL = getHarlyPublicOrigin();

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
  message?: string | null;
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
  const task = data.task as Record<string, unknown> | undefined;

  const who =
    (candidate?.name as string) ||
    (application?.candidateName as string) ||
    null;
  const role =
    (job?.title as string) ||
    (application?.jobTitle as string) ||
    null;

  if (event === "job.published") return role ? `“${role}” is now live` : null;
  if (event === "task.completed") return task?.title ? String(task.title) : null;
  if (interview?.title) return String(interview.title);
  if (who && role) return `${who} → ${role}`;
  return who ?? role ?? null;
}

function buildHref(event: WebhookEvent, data: Record<string, unknown>): string {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const interview = data.interview as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const task = data.task as Record<string, unknown> | undefined;
  const candidateId = candidate?.id ?? application?.candidateId ?? interview?.candidateId;

  if (candidateId) return `${APP_URL}/dashboard/candidates/${encodeURIComponent(String(candidateId))}`;
  if (event === "task.completed" && task?.id) return `${APP_URL}/dashboard/tasks`;
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

async function getWorkspaceChatBranding(workspaceId: string, database: typeof db = db): Promise<ChatBranding> {
  const [row] = await database
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
  database: typeof db = db,
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
      ? database
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
      ? database
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
  const customMessage = typeof data.workflowMessage === "string" && data.workflowMessage.trim().length > 0
    ? data.workflowMessage.trim()
    : null;

  return {
    emoji: EVENT_EMOJI[event] ?? "🔔",
    title: WEBHOOK_EVENT_LABELS[event] ?? event,
    detail: describe(event, data),
    message: customMessage,
    href: buildHref(event, data),
    fields: buildFields(event, data),
    branding,
  };
}

function slackPayload(n: Normalized): unknown {
  const line = n.detail ? `${n.emoji} *${n.title}* · ${n.detail}` : `${n.emoji} *${n.title}*`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: line } },
  ];
  if (n.message) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: n.message } });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${n.href}|Open in Harly>` }],
  });
  return {
    text: `${n.title}${n.detail ? ` · ${n.detail}` : ""}${n.message ? `: ${n.message}` : ""}`,
    blocks,
  };
}

function discordPayload(n: Normalized): unknown {
  const brandingFooter = n.branding.hideHarlyBranding
    ? n.branding.name
    : `${n.branding.name} · Powered by Harly`;
  const description = [n.detail, n.message ? `> ${n.message}` : null]
    .filter(Boolean)
    .join("\n\n");
  return {
    username: n.branding.name.slice(0, 80),
    ...(n.branding.logoUrl ? { avatar_url: n.branding.logoUrl } : {}),
    embeds: [
      {
        title: `${n.emoji} ${n.title}`,
        description: description || undefined,
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
  options: { signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const n = normalize(event, data, branding);
  const body = config.provider === "slack" ? slackPayload(n) : discordPayload(n);

  try {
    const timeout = AbortSignal.timeout(8000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.idempotencyKey
          ? {
              "Idempotency-Key": options.idempotencyKey,
              "X-Harly-Idempotency-Key": options.idempotencyKey,
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "send failed" };
  }
}

/** A synchronous chat webhook may have accepted the message before the
 * response was lost. Workflow callers must reconcile this, never replay it. */
export class WorkflowChatDeliveryUncertainError extends Error {
  readonly uncertain: boolean;
  readonly retryable: boolean;

  constructor(message: string, options: { uncertain?: boolean; retryable?: boolean } = {}) {
    super(message);
    this.name = options.uncertain === false
      ? "WorkflowChatDeliveryError"
      : "WorkflowChatDeliveryUncertainError";
    this.uncertain = options.uncertain ?? true;
    this.retryable = options.retryable ?? false;
  }
}

function chatDeliveryError(result: { status?: number; error?: string }) {
  const status = result.status;
  // A 429 is an explicit provider back-pressure response: it is safe to
  // retry, while a 4xx response is an actionable configuration/payload error.
  if (status === 429) {
    return new WorkflowChatDeliveryUncertainError(
      result.error ?? "Chat provider rate limited the request",
      { uncertain: false, retryable: true },
    );
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return new WorkflowChatDeliveryUncertainError(
      result.error ?? `Chat provider rejected the request (${status})`,
      { uncertain: false },
    );
  }
  return new WorkflowChatDeliveryUncertainError(
    result.error ?? `Chat webhook returned ${status ?? "an error"}`,
  );
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
  // Demo lockdown: never POST to visitor-configured Slack/Discord webhooks.
  if (isDemoMode()) return;
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
    const result = await sendChatMessage(config, event, enrichedData, branding, {
      idempotencyKey: typeof data.eventId === "string" ? data.eventId : undefined,
    });
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

/**
 * Workflow-owned chat delivery. A workflow action must not turn a missing
 * integration or failed webhook into a successful run step. OAuth Slack is
 * persisted in slack_deliveries; custom Slack/Discord webhooks carry the
 * workflow effect key and ambiguous responses become `uncertain`.
 */
export async function sendWorkflowChatMessage(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: { signal?: AbortSignal; database?: typeof db } = {},
): Promise<{ queued: boolean; provider: "slack" | "discord" }> {
  // Public demo: workflow Slack/Discord must not POST to real webhooks or queue
  // OAuth Slack deliveries that could leave the demo for a visitor's channel.
  if (isDemoMode()) {
    return { queued: false, provider: "slack" };
  }
  const database = options.database ?? db;
  const slack = await getWorkspaceSlackConfig(workspaceId, database);
  if (slack) {
    const { notifySlackEvent } = await import("@/server/notify/slack");
    const result = await notifySlackEvent(workspaceId, event, data, { force: true, database });
    if (!result.queued) throw new Error("Slack delivery was not queued");
    return { queued: true, provider: "slack" };
  }

  const config = await getWorkspaceChatConfig(workspaceId, database);
  if (!config) throw new Error("No Slack or Discord integration is configured");
  const [enrichedData, branding] = await Promise.all([
    enrichChatData(workspaceId, data, database),
    getWorkspaceChatBranding(workspaceId, database),
  ]);
  const result = await sendChatMessage(config, event, enrichedData, branding, {
    signal: options.signal,
    idempotencyKey: typeof data.eventId === "string" ? data.eventId : undefined,
  });
  if (!result.ok) {
    throw chatDeliveryError(result);
  }
  return { queued: false, provider: config.provider };
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
  const message = n.message ? `\n\n${escapeHtml(n.message)}` : "";
  return `${n.emoji} <b>${escapeHtml(n.title)}</b>${detail}${message}\n<a href="${n.href}">Open in Harly</a>`;
}

export async function sendWorkflowTelegramMessage(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: { signal?: AbortSignal; database?: typeof db } = {},
): Promise<{ provider: "telegram" }> {
  // Public demo: workflow Telegram must match notifyTelegramEvent — no real Bot API calls.
  if (isDemoMode()) {
    return { provider: "telegram" };
  }
  const config = await getWorkspaceTelegramConfig(workspaceId, options.database ?? db);
  if (!config) throw new Error("No Telegram integration is configured");
  await sendTelegramMessage({
    botToken: config.botToken,
    chatId: config.chatId,
    text: telegramText(event, data),
    signal: options.signal,
  });
  return { provider: "telegram" };
}

export async function sendWorkflowDiscordMessage(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: { signal?: AbortSignal; database?: typeof db } = {},
): Promise<{ provider: "discord" }> {
  // Public demo: never POST to visitor-configured Discord webhooks from workflows.
  if (isDemoMode()) {
    return { provider: "discord" };
  }
  const database = options.database ?? db;
  const config = await getWorkspaceChatConfig(workspaceId, database);
  if (!config || config.provider !== "discord") {
    throw new Error("No Discord integration is configured");
  }
  const [enrichedData, branding] = await Promise.all([
    enrichChatData(workspaceId, data, database),
    getWorkspaceChatBranding(workspaceId, database),
  ]);
  const result = await sendChatMessage(config, event, enrichedData, branding, {
    signal: options.signal,
    idempotencyKey: typeof data.eventId === "string" ? data.eventId : undefined,
  });
  if (!result.ok) throw chatDeliveryError(result);
  return { provider: "discord" };
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
  if (isDemoMode()) return;
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
