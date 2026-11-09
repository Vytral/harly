"use server";

import { revalidatePath } from "next/cache";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";

import { db, webhookDeliveries, webhookDeliveryAttempts } from "@harly/db";

import {
  getRolePermissions,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { missingScopePermissions } from "@/features/developers/api-key-permissions";
import { createLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/server/api/ratelimit";
import { dispatchDueWebhooks } from "@/server/webhooks/dispatch";

const log = createLogger("developers");
import {
  createApiKey,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  listWebhookDeliveries,
  replayWebhookDelivery,
  revokeApiKey,
  rotateWebhookSecret,
  serializeDelivery,
  updateWebhookEndpoint,
} from "@/features/developers/data";

import { assertNotDemo } from "@/features/demo/assert-not-demo";

export type DevActionResult = { ok: boolean; error?: string };

const SETTINGS_PATH = "/settings/developers";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function createApiKeyAction(input: {
  name: string;
  type: "publishable" | "secret";
  scopes: string[];
  expiresInDays?: number | null;
}): Promise<DevActionResult & { raw?: string }> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization, user, roleKey } = await requirePermission(
      "integrations:manage",
    );
    // A key can only carry scopes the creator could exercise in the app.
    const held = await getRolePermissions(organization.id, roleKey);
    const missing = missingScopePermissions(input.scopes, held);
    if (missing.length > 0) {
      const names = missing.map((item) => item.scope).join(", ");
      return {
        ok: false,
        error: t("scopesNotGrantable", { names }),
      };
    }
    const expiresAt =
      input.expiresInDays && input.expiresInDays > 0
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null;

    const { raw } = await createApiKey({
      workspaceId: organization.id,
      name: input.name,
      type: input.type,
      scopes: input.scopes,
      createdById: user.id,
      expiresAt,
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, raw };
  } catch (error) {
    log.error(error, "developer action failed");
    return { ok: false, error: errorMessage(error, t("createKeyFailed")) };
  }
}

export async function revokeApiKeyAction(
  keyId: string,
): Promise<DevActionResult> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    await revokeApiKey({ workspaceId: organization.id, keyId });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, t("revokeKeyFailed")) };
  }
}

export async function createWebhookAction(input: {
  url: string;
  events: string[];
  description?: string;
}): Promise<DevActionResult & { secret?: string }> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization, user } = await requirePermission(
      "integrations:manage",
    );
    const { secret } = await createWebhookEndpoint({
      workspaceId: organization.id,
      url: input.url,
      events: input.events,
      description: input.description ?? null,
      createdById: user.id,
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, secret };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("createWebhookFailed")),
    };
  }
}

export async function updateWebhookAction(input: {
  id: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
  description?: string | null;
}): Promise<DevActionResult> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    await updateWebhookEndpoint({
      workspaceId: organization.id,
      id: input.id,
      patch: {
        url: input.url,
        events: input.events,
        enabled: input.enabled,
        description: input.description,
      },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("updateWebhookFailed")),
    };
  }
}

export async function deleteWebhookAction(
  id: string,
): Promise<DevActionResult> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    await deleteWebhookEndpoint({ workspaceId: organization.id, id });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("deleteWebhookFailed")),
    };
  }
}

export async function rotateWebhookSecretAction(
  id: string,
): Promise<DevActionResult & { secret?: string }> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    const { secret } = await rotateWebhookSecret({
      workspaceId: organization.id,
      id,
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, secret };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("rotateSecretFailed")),
    };
  }
}

export async function listWebhookDeliveriesAction(
  endpointId: string,
): Promise<
  DevActionResult & {
    deliveries?: Array<
      ReturnType<typeof serializeDelivery> & { durationMs: number | null }
    >;
  }
> {
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    await getWebhookEndpoint({ workspaceId: organization.id, id: endpointId });
    const deliveries = await listWebhookDeliveries({
      workspaceId: organization.id,
      endpointId,
      limit: 20,
    });
    const durations = await lastAttemptDurations(deliveries.map((d) => d.id));
    return {
      ok: true,
      deliveries: deliveries.map((delivery) => ({
        ...serializeDelivery(delivery),
        durationMs: durations.get(delivery.id) ?? null,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("loadDeliveriesFailed")),
    };
  }
}

export async function replayWebhookDeliveryAction(input: {
  endpointId: string;
  deliveryId: string;
}): Promise<DevActionResult> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    await replayWebhookDelivery({
      workspaceId: organization.id,
      endpointId: input.endpointId,
      deliveryId: input.deliveryId,
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, t("replayDeliveryFailed")),
    };
  }
}

/** Duration (ms) of the most recent attempt per delivery, from the attempt log. */
async function lastAttemptDurations(
  deliveryIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (deliveryIds.length === 0) return result;
  const rows = await db
    .select({
      deliveryId: webhookDeliveryAttempts.deliveryId,
      attempt: webhookDeliveryAttempts.attempt,
      startedAt: webhookDeliveryAttempts.startedAt,
      finishedAt: webhookDeliveryAttempts.finishedAt,
    })
    .from(webhookDeliveryAttempts)
    .where(inArray(webhookDeliveryAttempts.deliveryId, deliveryIds));
  const latest = new Map<string, number>();
  for (const row of rows) {
    if (!row.finishedAt) continue;
    if ((latest.get(row.deliveryId) ?? 0) >= row.attempt) continue;
    latest.set(row.deliveryId, row.attempt);
    result.set(row.deliveryId, row.finishedAt.getTime() - row.startedAt.getTime());
  }
  return result;
}

export type WebhookTestResult = DevActionResult & {
  status?: string;
  responseStatus?: number | null;
  durationMs?: number | null;
  detail?: string | null;
};

/** At most 5 test pings per endpoint per minute. */
const TEST_LIMIT = { limit: 5, windowMs: 60_000 } as const;

export async function testWebhookAction(id: string): Promise<WebhookTestResult> {
  assertNotDemo();
  const t = await getTranslations("server.developers.actions");
  try {
    const { organization } = await requirePermission("integrations:manage");
    const endpoint = await getWebhookEndpoint({
      workspaceId: organization.id,
      id,
    });
    if (!endpoint.enabled) {
      return {
        ok: false,
        error: t("endpointPaused"),
      };
    }
    await enforceRateLimit(`webhook-test:${organization.id}:${endpoint.id}`, TEST_LIMIT);

    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        workspaceId: organization.id,
        endpointId: endpoint.id,
        event: "webhook.test",
        payload: {
          event: "webhook.test",
          eventId: randomUUID(),
          eventVersion: 1,
          schemaVersion: 1,
          created: Math.floor(Date.now() / 1000),
          workspace: organization.id,
          data: { test: true, message: "Harly webhook test event." },
        },
        status: "pending",
      })
      .returning();
    const summary = await dispatchDueWebhooks(1, [delivery.id]);
    const [row] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, delivery.id))
      .limit(1);
    const durations = await lastAttemptDurations([delivery.id]);
    const status =
      row?.status ??
      (summary.success > 0 ? "success" : summary.failed > 0 ? "failed" : "pending");
    revalidatePath(SETTINGS_PATH);
    return {
      ok: status === "success",
      status,
      responseStatus: row?.responseStatus ?? null,
      durationMs: durations.get(delivery.id) ?? null,
      detail: row?.lastError ?? null,
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error, t("sendTestFailed")) };
  }
}
