import "server-only";

import { and, eq } from "drizzle-orm";

import { db, webhookEndpoints, webhookDeliveries } from "@harly/db";

import { dispatchDueWebhooks } from "./dispatch";
import type { WebhookEvent } from "./events";
import { notifySlackEvent } from "@/server/notify/slack";
import { notifyChatEvent } from "@/server/notify/dispatch";
import { notifyInboxEvent } from "@/server/notify/inbox";
import { notifyOutlookEvent } from "@/server/notify/outlook";
import { notifyZoomEvent } from "@/server/notify/zoom";
import { createLogger } from "@/lib/logger";

const log = createLogger("webhooks");

/**
 * Emit a domain event to all subscribed webhook endpoints.
 *
 * Durability contract: the delivery rows are inserted synchronously (awaited),
 * so even if the immediate best-effort send is interrupted, the cron dispatcher
 * will retry. Failures here never propagate to the caller — a broken webhook
 * must not break the hiring flow that triggered it.
 */
export async function emitWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.workspaceId, workspaceId),
          eq(webhookEndpoints.enabled, true),
        ),
      );

    const subscribed = endpoints.filter((endpoint) =>
      (Array.isArray(endpoint.events) ? endpoint.events : []).includes(event),
    );
    if (subscribed.length > 0) {
      const created = Math.floor(Date.now() / 1000);

      for (const endpoint of subscribed) {
        const payload = { event, created, workspace: workspaceId, data };
        const [row] = await db
          .insert(webhookDeliveries)
          .values({
            workspaceId,
            endpointId: endpoint.id,
            event,
            payload,
            status: "pending",
          })
          .returning();

        if (!row) continue;
        // Best-effort immediate delivery; the dispatcher is the safety net.
        void dispatchDueWebhooks(1, [row.id]).catch((err) => log.error(err, "deliverWebhook failed"));
      }
    }
  } catch (error) {
    log.error({ workspaceId, event, error }, "[webhooks] emit failed");
  }

  // Fire-and-forget: chat webhook (Slack/Discord incoming-webhook) + Slack OAuth API
  void notifyChatEvent(workspaceId, event, data).catch((err) => log.error(err, "notifyChatEvent failed"));
  void notifySlackEvent(workspaceId, event, data).catch((err) => log.error(err, "notifySlackEvent failed"));
  void notifyInboxEvent(workspaceId, event, data).catch((err) => log.error(err, "notifyInboxEvent failed"));
  void notifyOutlookEvent(workspaceId, event, data).catch((err) => log.error(err, "notifyOutlookEvent failed"));
  void notifyZoomEvent(workspaceId, event, data).catch((err) => log.error(err, "notifyZoomEvent failed"));
}
