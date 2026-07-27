import "server-only";

import { and, eq } from "drizzle-orm";

import { db, webhookEndpoints, webhookDeliveries } from "@harly/db";

import { dispatchDueWebhooks } from "./dispatch";
import type { WebhookEvent } from "./events";
import { notifySlackEvent } from "@/server/notify/slack";
import { notifyChatEvent, notifyTelegramEvent } from "@/server/notify/dispatch";
import { notifyInboxEvent } from "@/server/notify/inbox";
import { notifyOutlookEvent } from "@/server/notify/outlook";
import { notifyZoomEvent } from "@/server/notify/zoom";
import { dispatchWorkflowEvent } from "@/features/automations/dispatch";
import { createLogger } from "@/lib/logger";
import { emitDomainEvent } from "@/server/events/emit";

const log = createLogger("webhooks");

type EmitWebhookOptions = {
  actorId?: string;
  eventId?: string;
  /** The durable event was inserted in the business transaction already. */
  skipDomainEvent?: boolean;
};

/**
 * Emit a domain event to all subscribed webhook endpoints.
 *
 * Durability contract: the delivery rows are inserted synchronously (awaited),
 * so even if the immediate best-effort send is interrupted, the cron dispatcher
 * will retry. Failures here never propagate to the caller , a broken webhook
 * must not break the hiring flow that triggered it.
 */
export async function emitWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  options: EmitWebhookOptions = {},
): Promise<void> {
  if (!options.skipDomainEvent) {
    await emitDomainEvent({
      name: event,
      workspaceId,
      actorId: options.actorId,
      aggregateType:
        typeof data.application === "object" && data.application
          ? "application"
          : typeof data.candidate === "object" && data.candidate
            ? "candidate"
            : typeof data.job === "object" && data.job
              ? "job"
              : undefined,
      aggregateId:
        typeof data.application === "object" &&
        data.application &&
        "id" in data.application
          ? String(data.application.id)
          : typeof data.candidate === "object" &&
              data.candidate &&
              "id" in data.candidate
            ? String(data.candidate.id)
            : typeof data.job === "object" && data.job && "id" in data.job
              ? String(data.job.id)
              : undefined,
      payload: data,
    }).catch((error) =>
      log.error({ workspaceId, event, error }, "domain event emit failed"),
    );
  }

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
        void dispatchDueWebhooks(1, [row.id]).catch((err) =>
          log.error(err, "deliverWebhook failed"),
        );
      }
    }
  } catch (error) {
    log.error({ workspaceId, event, error }, "[webhooks] emit failed");
  }

  // Fire-and-forget: chat webhook (Slack/Discord incoming-webhook) + Slack OAuth API
  void notifyChatEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyChatEvent failed"),
  );
  void notifyTelegramEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyTelegramEvent failed"),
  );
  void notifySlackEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifySlackEvent failed"),
  );
  void notifyInboxEvent(
    workspaceId,
    event,
    data,
    options.actorId ??
      (typeof data.actorId === "string" ? data.actorId : undefined),
    options.eventId ??
      (typeof data.eventId === "string" ? data.eventId : undefined),
  ).catch((err) => log.error(err, "notifyInboxEvent failed"));
  void notifyOutlookEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyOutlookEvent failed"),
  );
  void notifyZoomEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyZoomEvent failed"),
  );

  // Fire-and-forget: workflow automations. Finds enabled workflows whose
  // trigger matches this event and kicks off a best-effort run per match
  // (decision D3 — same pattern as the chat notify above). The run row is
  // persisted before execution, so a crash leaves it reclaimable by the cron.
  void dispatchWorkflowEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "dispatchWorkflowEvent failed"),
  );
}
