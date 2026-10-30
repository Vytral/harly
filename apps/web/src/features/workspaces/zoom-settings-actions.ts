"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { clearIntegrationHealth } from "@/features/integrations/health/repository";
import { sanitizeIntegrationError } from "@/features/integrations/health/model";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { zoomFetch } from "@/lib/zoom/client";

export type ZoomActionResult = { success: boolean; error?: string };

/** Save Zoom OAuth app credentials (Client ID + Secret) for this workspace. */
export async function saveZoomCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<ZoomActionResult> {
  assertNotDemo();
  const { organization } = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { success: false, error: "Server encryption key not configured." };
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    return { success: false, error: "Both Client ID and Client Secret are required." };
  }

  const encrypted = encryptSecret(clientSecret);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    zoomClientId: clientId,
    zoomClientSecretCiphertext: encrypted.ciphertext,
    zoomClientSecretIv: encrypted.iv,
    zoomClientSecretTag: encrypted.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: organization.id, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  revalidatePath("/settings/integrations");
  return { success: true };
}

export async function uninstallZoom() {
  assertNotDemo();
  const { organization } = await requirePermission("integrations:manage");
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, organization.id))
    .limit(1);

  if (!settings?.zoomEnabled) {
    return { success: false, error: "Zoom is not installed." };
  }

  await db
    .update(workspaceSettings)
    .set({
      zoomEnabled: false,
      zoomAccountId: null,
      zoomAccountEmail: null,
      zoomTokenCiphertext: null,
      zoomTokenIv: null,
      zoomTokenTag: null,
      zoomRefreshTokenCiphertext: null,
      zoomRefreshTokenIv: null,
      zoomRefreshTokenTag: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, organization.id));

  await clearIntegrationHealth(organization.id, "zoom");
  revalidatePath("/settings/integrations");
  return { success: true };
}

/**
 * Explicit connection check: one real Zoom API call as the workspace. A dead
 * token is refreshed first, and the outcome is recorded in the health model.
 */
export async function testZoomConnectionAction(): Promise<ZoomActionResult> {
  assertNotDemo();
  const { organization } = await requirePermission("integrations:manage");

  try {
    await zoomFetch<{ id: string }>(organization.id, "/v2/users/me");
    revalidatePath("/settings/integrations");
    return { success: true };
  } catch (error) {
    revalidatePath("/settings/integrations");
    return { success: false, error: sanitizeIntegrationError(error) };
  }
}
