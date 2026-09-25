import "server-only";

import { and, eq } from "drizzle-orm";

import { db, webhookEndpoints, webhookDeliveries } from "@harly/db";

import { dispatchDueWebhooks } from "./dispatch";
import { buildWebhookEnvelope, type WebhookEvent } from "./events";
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
  /** Workflow run that caused this event; used for deterministic loop control. */
  parentRunId?: string;
  /** Explicit database boundary for workflow workers and isolated tests. */
  database?: typeof db;
};

/** Options for `emitWebhookEvent` after `persistDomainEvent` already ran. */
export function webhookOptionsAfterPersist(
  persisted: { eventId: string; actorId?: string },
  extra?: { actorId?: string; parentRunId?: string },
): EmitWebhookOptions {
  return {
    skipDomainEvent: true,
    eventId: persisted.eventId,
    actorId: extra?.actorId ?? persisted.actorId,
    parentRunId: extra?.parentRunId,
  };
}

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
  const database = options.database ?? db;
  let persistedEventId =
    options.eventId ??
    (typeof data.eventId === "string" && data.eventId.length > 0
      ? data.eventId
      : undefined);
  if (!options.skipDomainEvent) {
    const persistedEvent = await emitDomainEvent({
      name: event,
      workspaceId,
      actorId: options.actorId,
      aggregateType:
        typeof data.application === "object" && data.application
          ? "application"
          : typeof data.candidate === "object" && data.candidate
            ? "candidate"
              : typeof data.interview === "object" && data.interview
                ? "interview"
                : typeof data.task === "object" && data.task
                  ? "task"
                  : typeof data.job === "object" && data.job
                    ? "job"
                    : typeof data.document === "object" && data.document
                      ? "document"
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
            : typeof data.interview === "object" && data.interview && "id" in data.interview
              ? String(data.interview.id)
              : typeof data.task === "object" && data.task && "id" in data.task
                ? String(data.task.id)
                : typeof data.job === "object" && data.job && "id" in data.job
                  ? String(data.job.id)
                  : typeof data.document === "object" && data.document && "id" in data.document
                    ? String(data.document.id)
                  : undefined,
      payload: data,
      automationParentRunId: options.parentRunId,
    }, database).catch((error) =>
      log.error({ workspaceId, event, error }, "domain event emit failed"),
    );
    persistedEventId ??= persistedEvent?.eventId;
  }

  try {
    const endpoints = await database
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
      const aggregateType:
        | "application"
        | "candidate"
        | "interview"
        | "task"
        | "job"
        | "document"
        | undefined =
          typeof data.application === "object" && data.application
            ? "application"
            : typeof data.candidate === "object" && data.candidate
              ? "candidate"
              : typeof data.interview === "object" && data.interview
                ? "interview"
                : typeof data.task === "object" && data.task
                  ? "task"
                  : typeof data.job === "object" && data.job
                    ? "job"
                    : typeof data.document === "object" && data.document
                      ? "document"
                    : undefined;
      const aggregateEntity = aggregateType ? data[aggregateType] : undefined;
      const aggregateId = aggregateEntity && typeof aggregateEntity === "object" && "id" in aggregateEntity
        ? String(aggregateEntity.id)
        : undefined;

      for (const endpoint of subscribed) {
        const payload = buildWebhookEnvelope({
          event,
          workspaceId,
          data,
          eventId: persistedEventId,
          eventVersion: 1,
          schemaVersion: 1,
          parentRunId: options.parentRunId,
          aggregateType,
          aggregateId,
        });
        const [row] = await database
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

  // Chat webhooks remain best-effort. OAuth Slack is durably queued before the
  // event returns, and its dispatcher owns retries/dead-lettering.
  void notifyChatEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyChatEvent failed"),
  );
  void notifyTelegramEvent(workspaceId, event, data).catch((err) =>
    log.error(err, "notifyTelegramEvent failed"),
  );
  await notifySlackEvent(workspaceId, event, data).catch((err) =>
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
  void dispatchWorkflowEvent(workspaceId, event, data, {
    sourceEventId:
      persistedEventId ??
      (typeof data.eventId === "string" ? data.eventId : undefined),
    parentRunId: options.parentRunId,
    database,
  }).catch((err) =>
    log.error(err, "dispatchWorkflowEvent failed"),
  );
}
