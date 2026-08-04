import "server-only";

import { getWorkspaceOutlookConfig } from "@/lib/outlook/config";
import { sendMail } from "@/lib/outlook/client";
import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@/server/webhooks/events";

const EVENT_EMOJI: Record<WebhookEvent, string> = {
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
  "job.published": "📣",
};

function describe(
  event: WebhookEvent,
  data: Record<string, unknown>,
): string | null {
  const candidate = data.candidate as
    | Record<string, unknown>
    | undefined;
  const application = data.application as
    | Record<string, unknown>
    | undefined;
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
 * Send an email notification via Microsoft Graph when a domain event occurs.
 * Fire-and-forget: never throws.
 */
export async function notifyOutlookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceOutlookConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;
    if (!config.calendarId) return;

    const emoji = EVENT_EMOJI[event] ?? "🔔";
    const title = WEBHOOK_EVENT_LABELS[event] ?? event;
    const detail = describe(event, data);

    const subject = detail ? `${title} , ${detail}` : title;
    const body = `
      <div style="font-family: -apple-system, sans-serif; padding: 16px;">
        <p style="font-size: 16px;">${emoji} <strong>${title}</strong></p>
        ${detail ? `<p style="color: #666;">${detail}</p>` : ""}
        <p style="margin-top: 16px; font-size: 12px; color: #999;">
          Sent by Harly ATS
        </p>
      </div>
    `;

    // We don't have the user's email directly, so we send to ourselves
    // via the authenticated account. For real use, this would send to
    // the workspace admin or configured recipients.
    await sendMail(config.accessToken, {
      to: [config.calendarId], // calendarId doubles as notification target
      subject: `[Harly] ${subject}`,
      body,
    });
  } catch (error) {
    console.error("[notify] outlook send failed", {
      workspaceId,
      event,
      error,
    });
  }
}
