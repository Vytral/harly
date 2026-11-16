import "server-only";

import { and, desc, eq } from "drizzle-orm";

import {
  ApiError,
  allowedScopesForType,
  type ApiScope,
  generateApiKey,
  generateWebhookSecret,
  type ApiKeyType,
} from "@harly/api";
import {
  db,
  apiKeys,
  webhookDeliveries,
  webhookDeliveryAttempts,
  webhookEndpoints,
  type ApiKey,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { hasApiScope, type ApiKeyContext } from "@/server/api/auth";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { validateWebhookUrl } from "@/lib/ssrf";
import { isWebhookEvent, type WebhookEvent } from "@/server/webhooks/events";
import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";

const log = createLogger("developers");

/**
 * Developer-platform data layer: API keys + webhook endpoints, scoped by
 * workspace. Shared by the dashboard Settings → Developers UI and the REST API.
 */

// ----- Access control ------------------------------------------------------

/**
 * Who is calling a mutating or secret-bearing function here. REST routes pass
 * the authenticated API key (`auth`); dashboard server actions pass nothing and
 * are checked against the signed-in member's `integrations:manage` permission.
 * A caller that is neither fails closed, so a new call site cannot forget it.
 */
export type DeveloperCaller = Pick<
  ApiKeyContext,
  "workspaceId" | "type" | "scopes"
>;

export async function assertDeveloperAccess(
  workspaceId: string,
  apiScope: ApiScope,
  caller?: DeveloperCaller,
): Promise<void> {
  if (caller) {
    if (caller.workspaceId !== workspaceId) {
      throw ApiError.forbidden("This key does not belong to this workspace.");
    }
    if (apiScope.startsWith("api_keys:") && caller.type !== "secret") {
      throw ApiError.forbidden("API key management requires a secret API key.");
    }
    if (!hasApiScope(caller.scopes, apiScope)) {
      throw ApiError.forbidden(`This key is missing the \`${apiScope}\` scope.`);
    }
    return;
  }
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try {
    context = await requirePermission("integrations:manage");
  } catch {
    throw ApiError.forbidden("You do not have permission to manage developer settings.");
  }
  if (context.organization.id !== workspaceId) {
    throw ApiError.forbidden("You do not have permission to manage developer settings.");
  }
}

// ----- API keys ------------------------------------------------------------

export function serializeApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    type: key.type,
    environment: key.environment,
    prefix: key.prefix,
    last4: key.last4,
    scopes: key.scopes as string[],
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function listApiKeys(workspaceId: string): Promise<ApiKey[]> {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(input: {
  workspaceId: string;
  name: string;
  type: ApiKeyType;
  scopes: string[];
  environment?: "live" | "test";
  createdById?: string | null;
  expiresAt?: Date | null;
  caller?: DeveloperCaller;
}): Promise<{ key: ApiKey; raw: string }> {
  await assertDeveloperAccess(input.workspaceId, "api_keys:write", input.caller);
  const scopes = allowedScopesForType(input.type, input.scopes);
  if (scopes.length === 0) {
    throw ApiError.badRequest("At least one valid scope is required.");
  }

  const generated = generateApiKey({
    type: input.type,
    environment: input.environment,
  });
  const [row] = await db
    .insert(apiKeys)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      type: generated.type,
      environment: generated.environment,
      prefix: generated.prefix,
      last4: generated.last4,
      hashedKey: generated.hashedKey,
      scopes,
      createdById: input.createdById ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  return { key: row, raw: generated.raw };
}

export async function revokeApiKey(input: {
  workspaceId: string;
  keyId: string;
  caller?: DeveloperCaller;
}): Promise<void> {
  await assertDeveloperAccess(input.workspaceId, "api_keys:write", input.caller);
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, input.keyId),
        eq(apiKeys.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!row) throw ApiError.notFound("API key not found.");
}

// ----- Webhook endpoints ---------------------------------------------------

export function serializeWebhookEndpoint(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    events: endpoint.events as string[],
    enabled: endpoint.enabled,
    createdAt: endpoint.createdAt.toISOString(),
  };
}

/** Most recent delivery attempt for an endpoint, or null if never triggered. */
export async function getLastWebhookDelivery(input: {
  workspaceId: string;
  endpointId: string;
}) {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.workspaceId, input.workspaceId),
        eq(webhookDeliveries.endpointId, input.endpointId),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(1);
  return delivery ? serializeDelivery(delivery) : null;
}

function validateEvents(events: string[]): WebhookEvent[] {
  const valid = events.filter(isWebhookEvent);
  if (valid.length === 0) {
    throw ApiError.badRequest("Subscribe to at least one valid event.");
  }
  return valid;
}

export async function listWebhookEndpoints(
  workspaceId: string,
): Promise<WebhookEndpoint[]> {
  return db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.workspaceId, workspaceId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function createWebhookEndpoint(input: {
  workspaceId: string;
  url: string;
  events: string[];
  description?: string | null;
  createdById?: string | null;
  caller?: DeveloperCaller;
}): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:write", input.caller);
  await validateWebhookUrl(input.url).catch((error) => {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "Invalid webhook URL.",
    );
  });
  const events = validateEvents(input.events);
  const secret = generateWebhookSecret();
  const enc = encryptSecret(secret);

  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      workspaceId: input.workspaceId,
      url: input.url,
      description: input.description ?? null,
      secretCiphertext: enc.ciphertext,
      secretIv: enc.iv,
      secretTag: enc.tag,
      events,
      createdById: input.createdById ?? null,
    })
    .returning();

  return { endpoint, secret };
}

export async function updateWebhookEndpoint(input: {
  workspaceId: string;
  id: string;
  patch: {
    url?: string;
    events?: string[];
    enabled?: boolean;
    description?: string | null;
  };
  caller?: DeveloperCaller;
}): Promise<WebhookEndpoint> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:write", input.caller);
  const set: Partial<typeof webhookEndpoints.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.patch.url !== undefined) {
    await validateWebhookUrl(input.patch.url).catch((error) => {
      throw ApiError.badRequest(
        error instanceof Error ? error.message : "Invalid webhook URL.",
      );
    });
    set.url = input.patch.url;
  }
  if (input.patch.events !== undefined)
    set.events = validateEvents(input.patch.events);
  if (input.patch.enabled !== undefined) set.enabled = input.patch.enabled;
  if (input.patch.description !== undefined)
    set.description = input.patch.description;

  const [endpoint] = await db
    .update(webhookEndpoints)
    .set(set)
    .where(
      and(
        eq(webhookEndpoints.id, input.id),
        eq(webhookEndpoints.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!endpoint) throw ApiError.notFound("Webhook endpoint not found.");
  return endpoint;
}

export async function rotateWebhookSecret(input: {
  workspaceId: string;
  id: string;
  caller?: DeveloperCaller;
}): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:write", input.caller);
  const secret = generateWebhookSecret();
  const enc = encryptSecret(secret);
  const [endpoint] = await db
    .update(webhookEndpoints)
    .set({
      secretCiphertext: enc.ciphertext,
      secretIv: enc.iv,
      secretTag: enc.tag,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookEndpoints.id, input.id),
        eq(webhookEndpoints.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!endpoint) throw ApiError.notFound("Webhook endpoint not found.");
  return { endpoint, secret };
}

export async function deleteWebhookEndpoint(input: {
  workspaceId: string;
  id: string;
  caller?: DeveloperCaller;
}): Promise<void> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:write", input.caller);
  const [row] = await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, input.id),
        eq(webhookEndpoints.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: webhookEndpoints.id });
  if (!row) throw ApiError.notFound("Webhook endpoint not found.");
}

export async function getWebhookEndpoint(input: {
  workspaceId: string;
  id: string;
}): Promise<WebhookEndpoint> {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, input.id),
        eq(webhookEndpoints.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!endpoint) throw ApiError.notFound("Webhook endpoint not found.");
  return endpoint;
}

export function serializeDelivery(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    event: delivery.event,
    status: delivery.status,
    attempts: delivery.attempts,
    responseStatus: delivery.responseStatus,
    lastError: delivery.lastError,
    nextRetryAt: delivery.nextRetryAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    deadLetteredAt: delivery.deadLetteredAt?.toISOString() ?? null,
    replayOfId: delivery.replayOfId,
    createdAt: delivery.createdAt.toISOString(),
  };
}

export const WEBHOOK_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "success",
  "failed",
  "dead_letter",
] as const;

export type WebhookDeliveryStatus =
  (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export async function listWebhookDeliveries(input: {
  workspaceId: string;
  endpointId: string;
  limit?: number;
  status?: WebhookDeliveryStatus;
  caller?: DeveloperCaller;
}): Promise<WebhookDelivery[]> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:read", input.caller);
  return db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.workspaceId, input.workspaceId),
        eq(webhookDeliveries.endpointId, input.endpointId),
        input.status ? eq(webhookDeliveries.status, input.status) : undefined,
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(input.limit ?? 20);
}

export async function listWebhookDeliveryAttempts(input: {
  workspaceId: string;
  endpointId: string;
  deliveryId: string;
  caller?: DeveloperCaller;
}) {
  await assertDeveloperAccess(input.workspaceId, "webhooks:read", input.caller);
  await getWebhookEndpoint({ workspaceId: input.workspaceId, id: input.endpointId });
  return db.select().from(webhookDeliveryAttempts).innerJoin(webhookDeliveries, eq(webhookDeliveries.id, webhookDeliveryAttempts.deliveryId)).where(and(eq(webhookDeliveryAttempts.workspaceId, input.workspaceId), eq(webhookDeliveries.endpointId, input.endpointId), eq(webhookDeliveryAttempts.deliveryId, input.deliveryId))).orderBy(webhookDeliveryAttempts.attempt);
}

/** Queue a fresh delivery from an existing record without altering its audit log. */
export async function replayWebhookDelivery(input: {
  workspaceId: string;
  endpointId: string;
  deliveryId: string;
  caller?: DeveloperCaller;
}): Promise<WebhookDelivery> {
  await assertDeveloperAccess(input.workspaceId, "webhooks:write", input.caller);
  await getWebhookEndpoint({
    workspaceId: input.workspaceId,
    id: input.endpointId,
  });

  const [original] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, input.deliveryId),
        eq(webhookDeliveries.workspaceId, input.workspaceId),
        eq(webhookDeliveries.endpointId, input.endpointId),
      ),
    )
    .limit(1);
  if (!original) throw ApiError.notFound("Webhook delivery not found.");

  const [replay] = await db
    .insert(webhookDeliveries)
    .values({
      workspaceId: input.workspaceId,
      endpointId: input.endpointId,
      event: original.event,
      payload: original.payload,
      status: "pending",
      attempts: 0,
      replayOfId: original.id,
    })
    .returning();

  // Best-effort immediate delivery (matching emitWebhookEvent), so a replay
  // actually reaches the endpoint now instead of waiting for the next cron
  // tick. The dispatcher is the safety net if this fails.
  void dispatchDueWebhooks(1, [replay.id]).catch((err) =>
    log.error({ err, deliveryId: replay.id }, "replayWebhookDelivery: immediate dispatch failed"),
  );

  return replay;
}
