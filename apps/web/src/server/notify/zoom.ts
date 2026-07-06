import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import type { WebhookEvent } from "@/server/webhooks/events";

/**
 * Fire-and-forget: never throws.
 */
export async function notifyZoomEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const webhookUrl = process.env.ZOOM_WEBHOOK_URL;
  if (!webhookUrl) return;

  const [settings] = await db
    .select({ zoomAccountEmail: workspaceSettings.zoomAccountEmail })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!settings?.zoomAccountEmail) return;

  const payload = {
    event,
    workspace_id: workspaceId,
    zoom_account_email: settings.zoomAccountEmail,
    data,
    timestamp: new Date().toISOString(),
  };

  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error("[zoom] Failed to send webhook", error);
  });
}
