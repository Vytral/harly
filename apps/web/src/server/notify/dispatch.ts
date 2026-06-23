import "server-only";

import { getWorkspaceChatConfig, type ChatConfig } from "@/lib/notify/config";
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

type Normalized = { emoji: string; title: string; detail: string | null };

/** Best-effort extraction of a human label from a varied event payload. */
function describe(event: WebhookEvent, data: Record<string, unknown>): string | null {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;

  const who =
    (candidate?.name as string) ||
    (candidate?.email as string) ||
    (application?.candidateName as string) ||
    null;
  const role =
    (job?.title as string) ||
    (application?.jobTitle as string) ||
    null;

  if (event === "job.published") return role ? `“${role}” is now live` : null;
  if (who && role) return `${who} → ${role}`;
  return who ?? role ?? null;
}

function normalize(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Normalized {
  return {
    emoji: EVENT_EMOJI[event] ?? "🔔",
    title: WEBHOOK_EVENT_LABELS[event] ?? event,
    detail: describe(event, data),
  };
}

function slackPayload(n: Normalized): unknown {
  const line = n.detail ? `${n.emoji} *${n.title}* — ${n.detail}` : `${n.emoji} *${n.title}*`;
  return {
    text: `${n.title}${n.detail ? ` — ${n.detail}` : ""}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: line } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${APP_URL}/dashboard|Open Harly>` }],
      },
    ],
  };
}

function discordPayload(n: Normalized): unknown {
  return {
    username: "Harly",
    embeds: [
      {
        title: `${n.emoji} ${n.title}`,
        description: n.detail ?? undefined,
        url: `${APP_URL}/dashboard`,
        color: 0x2f6f4e, // pine
      },
    ],
  };
}

/** POST a single formatted message to the configured provider. */
export async function sendChatMessage(
  config: ChatConfig,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const n = normalize(event, data);
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
 * subscribed to that event. Never throws — failures are logged, not propagated.
 */
export async function notifyChatEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceChatConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;
    const result = await sendChatMessage(config, event, data);
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
