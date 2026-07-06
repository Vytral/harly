"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";

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
