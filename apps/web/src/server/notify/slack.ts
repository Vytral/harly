import "server-only";

import { WebClient } from "@slack/web-api";

import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@/server/webhooks/events";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

const EVENT_EMOJI: Record<WebhookEvent, string> = {
  "application.created": "📥",
  "application.stage_changed": "↗️",
  "application.hired": "🎉",
  "application.rejected": "🚫",
  "candidate.created": "👤",
  "job.published": "📣",
};

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

  if (event === "job.published") return role ? `"${role}" is now live` : null;
  if (who && role) return `${who} → ${role}`;
  return who ?? role ?? null;
}

/**
 * Send a rich Block Kit notification to the workspace's configured Slack channel.
 * Uses the OAuth bot token (chat.postMessage) instead of incoming webhooks.
 * Never throws — failures are logged, not propagated.
 */
export async function notifySlackEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceSlackConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;

    const emoji = EVENT_EMOJI[event] ?? "🔔";
    const title = WEBHOOK_EVENT_LABELS[event] ?? event;
    const detail = describe(event, data);

    const text = detail ? `${title} — ${detail}` : title;
    const mrkdwn = detail
      ? `${emoji} *${title}* — ${detail}`
      : `${emoji} *${title}*`;

    const client = new WebClient(config.botToken);
    await client.chat.postMessage({
      channel: config.channelId,
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: mrkdwn },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `<${APP_URL}/dashboard|Open Harly>` },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("[notify] slack send failed", { workspaceId, event, error });
  }
}
