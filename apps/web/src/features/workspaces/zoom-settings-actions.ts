"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type ZoomActionResult = { success: boolean; error?: string };

/** Save Zoom OAuth app credentials (Client ID + Secret) for this workspace. */
export async function saveZoomCredentialsAction(input: {
  clientId: string;
  clientSecret: string;
}): Promise<ZoomActionResult> {
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

  revalidatePath("/settings/integrations");
  return { success: true };
}
