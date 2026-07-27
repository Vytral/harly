import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { EVENT_HEADER, SIGNATURE_HEADER, signWebhookPayload } from "@harly/api";
import {
  db,
  webhookDeliveries,
  webhookDeliveryAttempts,
  webhookEndpoints,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@harly/db";
import { decryptSecret } from "@/lib/crypto";
import { safeFetchWebhook } from "@/lib/ssrf";

import { MAX_WEBHOOK_ATTEMPTS, RETRY_BACKOFF_MS } from "./events";

const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_BODY_LIMIT = 500;

function nextRetryAt(attempts: number): Date | null {
  // `attempts` already includes the failed attempt. The first failure must
  // therefore use the first configured delay (one minute), not the second.
  const delay = RETRY_BACKOFF_MS[attempts - 1];
  return delay ? new Date(Date.now() + delay) : null;
}

/**
 * Deliver a single queued webhook to its endpoint and record the outcome.
 * Used both for the immediate best-effort send (emit) and for retries (cron).
 */
export async function deliverWebhook(
  delivery: WebhookDelivery,
  endpoint: WebhookEndpoint,
  options?: { workerId?: string },
): Promise<"success" | "failed" | "exhausted"> {
  const attemptNumber = delivery.attempts + 1;
  const startedAt = new Date();
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let ok = false;

  try {
    const secret = decryptSecret({
      ciphertext: endpoint.secretCiphertext,
      iv: endpoint.secretIv,
      tag: endpoint.secretTag,
    });

    const response = await safeFetchWebhook(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Harly-Webhooks/1.0",
        [EVENT_HEADER]: delivery.event,
        [SIGNATURE_HEADER]: signWebhookPayload({ secret, body, timestamp }),
        "X-Harly-Delivery": delivery.id,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    responseStatus = response.status;
    responseBody = (await response.text().catch(() => "")).slice(
      0,
      RESPONSE_BODY_LIMIT,
    );
    ok = response.ok;
  } catch (error) {
    responseBody = (error instanceof Error ? error.message : "Request failed").slice(
      0,
      RESPONSE_BODY_LIMIT,
    );
  }

  const status: "success" | "failed" | "exhausted" = ok
    ? "success"
    : attemptNumber >= MAX_WEBHOOK_ATTEMPTS
      ? "exhausted"
      : "failed";

  const error = !ok && responseStatus === null ? responseBody : null;

  // Attempt rows are immutable operational history. Failure to write the
  // secondary audit record must never strand the delivery itself.
  await db
    .insert(webhookDeliveryAttempts)
    .values({
      workspaceId: delivery.workspaceId,
      deliveryId: delivery.id,
      attempt: attemptNumber,
      status: ok ? "success" : status === "exhausted" ? "dead_letter" : "failed",
      responseStatus,
      responseBody: responseStatus === null ? null : responseBody,
      error,
      startedAt,
      finishedAt: new Date(),
    })
    .onConflictDoNothing()
    .catch(() => undefined);

  await db
    .update(webhookDeliveries)
    .set({
      status,
      attempts: attemptNumber,
      responseStatus,
      responseBody,
      lastError: error,
      deliveredAt: ok ? new Date() : null,
      nextRetryAt: status === "failed" ? nextRetryAt(attemptNumber) : null,
      deadLetteredAt: status === "exhausted" ? new Date() : null,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookDeliveries.id, delivery.id),
        options?.workerId
          ? eq(webhookDeliveries.lockedBy, options.workerId)
          : undefined,
        options?.workerId
          ? eq(webhookDeliveries.status, "processing")
          : undefined,
      ),
    );

  return status;
}

/**
 * Pick due deliveries (pending or failed-and-ready) and attempt them. Invoked
 * by the cron route. Returns a small summary for observability.
 */
export async function dispatchDueWebhooks(
  limit = 50,
  ids?: string[],
): Promise<{ processed: number; success: number; failed: number }> {
  const workerId = randomUUID();
  const idsFilter = ids?.length
    ? sql`and delivery."id" in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const claimed = (await db.execute(sql`
    with candidates as (
      select delivery."id"
      from "webhook_deliveries" as delivery
      inner join "webhook_endpoints" as endpoint
        on endpoint."id" = delivery."endpoint_id"
        and endpoint."enabled" = true
      where (
        (delivery."status" in ('pending', 'failed') and (delivery."next_retry_at" is null or delivery."next_retry_at" <= now()))
        or (delivery."status" = 'processing' and delivery."locked_at" < now() - interval '5 minutes')
      )
      ${idsFilter}
      order by delivery."created_at"
      for update skip locked
      limit ${limit}
    )
    update "webhook_deliveries" as delivery
    set "status" = 'processing', "locked_at" = now(), "locked_by" = ${workerId}, "updated_at" = now()
    from candidates
    where delivery."id" = candidates."id"
    returning delivery."id"
  `)) as unknown as Array<{ id: string }>;

  if (claimed.length === 0) return { processed: 0, success: 0, failed: 0 };

  const due = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId),
    )
    .where(
      and(
        inArray(webhookDeliveries.id, claimed.map((row) => row.id)),
        eq(webhookDeliveries.lockedBy, workerId),
        eq(webhookEndpoints.enabled, true),
      ),
    )
    .orderBy(asc(webhookDeliveries.createdAt))
    .limit(limit);

  // Endpoint can be disabled after the claim and before the read above. Put
  // those rows back in the queue rather than stranding them as `processing`.
  const dueIds = new Set(due.map((row) => row.delivery.id));
  const releasedIds = claimed
    .map((row) => row.id)
    .filter((id) => !dueIds.has(id));
  if (releasedIds.length > 0) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "pending",
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(webhookDeliveries.id, releasedIds),
          eq(webhookDeliveries.lockedBy, workerId),
        ),
      );
  }

  let success = 0;
  let failed = 0;
  for (const row of due) {
    const result = await deliverWebhook(row.delivery, row.endpoint, { workerId });
    if (result === "success") success += 1;
    else failed += 1;
  }

  return { processed: due.length, success, failed };
}
