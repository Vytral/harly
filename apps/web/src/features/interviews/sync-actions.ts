"use server";

import { getTranslations } from "@/i18n/server";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

import { retryInterviewSyncForWorkspace } from "./sync-retry";

const log = createLogger("interview-sync-actions");

/** Retry one failed/pending provider operation from the interview detail. */
export async function retryInterviewSyncAction(input: {
  syncId: string;
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  const t = await getTranslations("server.interviews.syncActions");
  try {
    const { organization } = await getWorkspaceContext();
    await requirePermission("collab:write");
    return retryInterviewSyncForWorkspace({
      workspaceId: organization.id,
      syncId: input.syncId,
    });
  } catch (error) {
    log.error(error, "retryInterviewSyncAction failed");
    return { success: false, error: t("retryFailed") };
  }
}
