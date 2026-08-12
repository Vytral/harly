import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { WebClient } from "@slack/web-api";

import {
  db,
  candidates,
  slackDeliveries,
  slackDeliveryAttempts,
  workspaceSettings,
  type SlackDelivery,
} from "@harly/db";

import { getWorkspaceSlackConfig } from "@/lib/slack/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { createLogger } from "@/lib/logger";
import { recordSlackDelivery } from "@/server/observability/metrics";
import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@/server/webhooks/events";

const log = createLogger("slack-notifications");
const APP_URL = getHarlyPublicOrigin();
const MAX_ATTEMPTS = 6;
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

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

type SlackPayload = {
  text: string;
  blocks: Array<Record<string, unknown>>;
  /** Internal routing metadata; stripped before calling Slack. */
  _harly?: { candidateIds?: string[]; applicationIds?: string[] };
};

function sourceIds(data: Record<string, unknown>) {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const candidateId =
    (candidate?.id as string) ??
    (application?.candidateId as string) ??
    (data.candidateId as string) ??
    null;
  const applicationId =
    (application?.id as string) ?? (data.applicationId as string) ?? null;

  return {
    candidateIds: candidateId ? [candidateId] : [],
    applicationIds: applicationId ? [applicationId] : [],
  };
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").slice(0, 240);
}

/** Build a deliberately minimal payload: names and job titles only, never contact data. */
export function buildSlackPayload(event: WebhookEvent, data: Record<string, unknown>): SlackPayload {
  const candidate = data.candidate as Record<string, unknown> | undefined;
  const application = data.application as Record<string, unknown> | undefined;
  const job = data.job as Record<string, unknown> | undefined;
  const rawWho = (candidate?.name as string) || (application?.candidateName as string) || null;
  const rawRole = (job?.title as string) || (application?.jobTitle as string) || null;
  const who = rawWho ? escapeSlackText(rawWho) : null;
  const role = rawRole ? escapeSlackText(rawRole) : null;
  const title = WEBHOOK_EVENT_LABELS[event] ?? event;
  const detail = event === "job.published"
    ? role ? `“${role}” is now live` : null
    : who && role ? `${who} → ${role}` : who ?? role;
  const emoji = EVENT_EMOJI[event] ?? "🔔";
  const text = detail ? `${title} , ${detail}` : title;
  const mrkdwn = detail ? `${emoji} *${title}* , ${detail}` : `${emoji} *${title}*`;

  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: mrkdwn } },
      { type: "context", elements: [{ type: "mrkdwn", text: `<${APP_URL}/dashboard|Open Harly>` }] },
    ],
  };
}

function slackErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data?: { error?: unknown } }).data;
  return data && typeof data.error === "string" ? data.error : null;
}

function retryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const sdkError = error as { retryAfter?: unknown; data?: { retry_after?: unknown; response_metadata?: { retry_after?: unknown; retryAfter?: unknown } } };
  const data = sdkError.data;
  const seconds = sdkError.retryAfter ?? data?.retry_after ?? data?.response_metadata?.retry_after ?? data?.response_metadata?.retryAfter;
  return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : null;
}

const PERMANENT_ERRORS = new Set([
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
  "missing_scope",
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "no_permission",
]);
const AUTH_ERRORS = new Set([
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
]);

function nextRetryAt(attempt: number, error: unknown): Date | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  const delay = retryAfterMs(error) ?? RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS.at(-1)!;
  return new Date(Date.now() + delay);
}

function errorMessage(error: unknown): string {
  const code = slackErrorCode(error);
  if (code) return code;
  return (error instanceof Error ? error.message : "Slack request failed").slice(0, 500);
}

/** Persist the notification before any best-effort send is attempted. */
export async function notifySlackEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const config = await getWorkspaceSlackConfig(workspaceId);
    if (!config || !config.events.includes(event)) return;

    const eventId = typeof data.eventId === "string" ? data.eventId : null;
    const payload: SlackPayload = {
      ...buildSlackPayload(event, data),
      _harly: sourceIds(data),
    };
    const [delivery] = await db
      .insert(slackDeliveries)
      .values({
        workspaceId,
        event,
        channelId: config.channelId,
        payload,
        dedupeKey: eventId,
        status: "pending",
      })
      .onConflictDoNothing({ target: [slackDeliveries.workspaceId, slackDeliveries.dedupeKey] })
      .returning({ id: slackDeliveries.id });

    if (delivery) {
      void dispatchDueSlack(1, [delivery.id]).catch((error) =>
        log.error({ workspaceId, deliveryId: delivery.id, error }, "Slack immediate dispatch failed"),
      );
    }
  } catch (error) {
    log.error({ workspaceId, event, error }, "failed to enqueue Slack notification");
  }
}

function classify(error: unknown): "failed" | "dead_letter" {
  const code = slackErrorCode(error);
  return code && PERMANENT_ERRORS.has(code) ? "dead_letter" : "failed";
}

async function markSlackRevoked(workspaceId: string): Promise<void> {
  await db.update(workspaceSettings).set({
    slackEnabled: false,
    slackBotTokenCiphertext: null,
    slackBotTokenIv: null,
    slackBotTokenTag: null,
    slackLastValidatedAt: null,
    slackRevokedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(workspaceSettings.organizationId, workspaceId));
}

export async function deliverSlack(
  delivery: SlackDelivery,
  workerId: string,
): Promise<"success" | "failed" | "dead_letter"> {
  const attempt = delivery.attempts + 1;
  const startedAt = new Date();
  let status: "success" | "failed" | "dead_letter" = "failed";
  const responseStatus: number | null = null;
  let slackError: string | null = null;
  let failure: unknown = null;

  try {
    const config = await getWorkspaceSlackConfig(delivery.workspaceId);
    if (!config) {
      slackError = "integration_disabled";
      status = "dead_letter";
    } else {
      const payload = delivery.payload as SlackPayload;
      const candidateIds = payload._harly?.candidateIds ?? [];
      if (candidateIds.length > 0) {
        const activeCandidates = await db
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.workspaceId, delivery.workspaceId),
              inArray(candidates.id, candidateIds),
              isNull(candidates.deletedAt),
            ),
          );
        if (activeCandidates.length !== new Set(candidateIds).size) {
          slackError = "candidate_deleted";
          status = "dead_letter";
        }
      }
      if (status === "dead_letter") {
        // Do not send a queued notification for a candidate that is no longer
        // active. The row remains as an auditable dead-letter outcome.
      } else {
        const message = { text: payload.text, blocks: payload.blocks };
        const client = new WebClient(config.botToken);
        await client.chat.postMessage({
          channel: delivery.channelId,
          ...message,
        });
        status = "success";
      }
    }
  } catch (error) {
    failure = error;
    slackError = errorMessage(error);
    status = classify(error);
    if (status === "dead_letter" && AUTH_ERRORS.has(slackErrorCode(error) ?? "")) {
      await markSlackRevoked(delivery.workspaceId).catch((revokeError) =>
        log.error({ workspaceId: delivery.workspaceId, error: revokeError }, "failed to mark Slack revoked"),
      );
    }
  }

  if (status === "failed" && attempt >= MAX_ATTEMPTS) status = "dead_letter";
  await db.insert(slackDeliveryAttempts).values({
    workspaceId: delivery.workspaceId,
    deliveryId: delivery.id,
    attempt,
    status,
    responseStatus,
    slackError,
    error: failure && !slackError ? errorMessage(failure) : null,
    startedAt,
    finishedAt: new Date(),
  }).onConflictDoNothing().catch(() => undefined);

  await db.update(slackDeliveries).set({
    status,
    attempts: attempt,
    responseStatus,
    slackError,
    lastError: status === "success" ? null : slackError,
    nextRetryAt: status === "failed" ? nextRetryAt(attempt, failure) : null,
    deliveredAt: status === "success" ? new Date() : null,
    deadLetteredAt: status === "dead_letter" ? new Date() : null,
    lockedAt: null,
    lockedBy: null,
    updatedAt: new Date(),
  }).where(and(
    eq(slackDeliveries.id, delivery.id),
    eq(slackDeliveries.status, "processing"),
    eq(slackDeliveries.lockedBy, workerId),
  ));

  recordSlackDelivery(status);
  return status;
}

/** Claim and deliver pending/retryable Slack rows with the same locking model as webhooks. */
export async function dispatchDueSlack(limit = 50, ids?: string[]) {
  const workerId = randomUUID();
  const idsFilter = ids?.length
    ? sql`and delivery."id" in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    : sql``;
  const claimed = (await db.execute(sql`
    with candidates as (
      select delivery."id"
      from "slack_deliveries" as delivery
      where (
        (delivery."status" in ('pending', 'failed') and (delivery."next_retry_at" is null or delivery."next_retry_at" <= now()))
        or (delivery."status" = 'processing' and delivery."locked_at" < now() - interval '5 minutes')
      )
      and not exists (
        select 1 from "slack_deliveries" as active
        where active."workspace_id" = delivery."workspace_id"
          and active."channel_id" = delivery."channel_id"
          and active."status" = 'processing'
          and active."id" <> delivery."id"
      )
      and not exists (
        select 1 from "slack_deliveries" as recent
        where recent."workspace_id" = delivery."workspace_id"
          and recent."channel_id" = delivery."channel_id"
          and recent."status" in ('success', 'failed')
          and recent."updated_at" > now() - interval '1 second'
      ) ${idsFilter}
      order by delivery."created_at"
      for update skip locked
      limit ${limit}
    )
    update "slack_deliveries" as delivery
    set "status" = 'processing', "locked_at" = now(), "locked_by" = ${workerId}, "updated_at" = now()
    from candidates
    where delivery."id" = candidates."id"
    returning delivery."id"
  `)) as unknown as Array<{ id: string }>;
  if (claimed.length === 0) return { processed: 0, success: 0, failed: 0, deadLetter: 0 };

  const rows = await db.select().from(slackDeliveries).where(and(
    inArray(slackDeliveries.id, claimed.map((row) => row.id)),
    eq(slackDeliveries.lockedBy, workerId),
    eq(slackDeliveries.status, "processing"),
  )).orderBy(asc(slackDeliveries.createdAt)).limit(limit);

  let success = 0;
  let failed = 0;
  let deadLetter = 0;
  for (const row of rows) {
    const result = await deliverSlack(row, workerId);
    if (result === "success") success += 1;
    else if (result === "dead_letter") deadLetter += 1;
    else failed += 1;
  }
  return { processed: rows.length, success, failed, deadLetter };
}

/** Keep delivery metadata bounded while retaining recent audit evidence. */
export async function purgeOldSlackDeliveries(): Promise<number> {
  const configuredDays = Number(process.env.SLACK_DELIVERY_RETENTION_DAYS ?? 90);
  const retentionDays = Number.isFinite(configuredDays)
    ? Math.max(30, Math.min(730, Math.floor(configuredDays)))
    : 90;
  const result = await db.execute(sql`
    delete from "slack_deliveries"
    where "created_at" < now() - make_interval(days => ${retentionDays})
      and "status" in ('success', 'dead_letter', 'failed')
  `);
  return Number((result as unknown as { count?: number }).count ?? 0);
}
