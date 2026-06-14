"use server";

import { revalidatePath } from "next/cache";

import { db, webhookDeliveries } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { deliverWebhook } from "@/server/webhooks/dispatch";
import {
  createApiKey,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  revokeApiKey,
  updateWebhookEndpoint,
} from "@/features/developers/data";

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
  try {
    const { organization, user } = await requirePermission(
      "integrations:manage",
    );
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
    return { ok: false, error: errorMessage(error, "Could not create key.") };
  }
}

export async function revokeApiKeyAction(
  keyId: string,
): Promise<DevActionResult> {
  try {
    const { organization } = await requirePermission("integrations:manage");
    await revokeApiKey({ workspaceId: organization.id, keyId });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not revoke key.") };
  }
}

export async function createWebhookAction(input: {
  url: string;
  events: string[];
  description?: string;
}): Promise<DevActionResult & { secret?: string }> {
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
      error: errorMessage(error, "Could not create webhook."),
    };
  }
}

export async function updateWebhookAction(input: {
  id: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
}): Promise<DevActionResult> {
  try {
    const { organization } = await requirePermission("integrations:manage");
    await updateWebhookEndpoint({
      workspaceId: organization.id,
      id: input.id,
      patch: { url: input.url, events: input.events, enabled: input.enabled },
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not update webhook."),
    };
  }
}

export async function deleteWebhookAction(
  id: string,
): Promise<DevActionResult> {
  try {
    const { organization } = await requirePermission("integrations:manage");
    await deleteWebhookEndpoint({ workspaceId: organization.id, id });
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Could not delete webhook."),
    };
  }
}

export async function testWebhookAction(
  id: string,
): Promise<DevActionResult & { status?: string }> {
  try {
    const { organization } = await requirePermission("integrations:manage");
    const endpoint = await getWebhookEndpoint({
      workspaceId: organization.id,
      id,
    });
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        workspaceId: organization.id,
        endpointId: endpoint.id,
        event: "application.created",
        payload: {
          event: "application.created",
          created: Math.floor(Date.now() / 1000),
          workspace: organization.id,
          data: { test: true, message: "Harly webhook test ping." },
        },
        status: "pending",
      })
      .returning();
    const status = await deliverWebhook(delivery, endpoint);
    revalidatePath(SETTINGS_PATH);
    return { ok: status === "success", status };
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not send test.") };
  }
}
