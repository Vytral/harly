"use server";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";

import { retryInterviewSyncForWorkspace } from "./sync-retry";

const log = createLogger("interview-sync-actions");

/** Retry one failed/pending provider operation from the interview detail. */
export async function retryInterviewSyncAction(input: {
  syncId: string;
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const { organization } = await getWorkspaceContext();
    await requirePermission("collab:write");
    return retryInterviewSyncForWorkspace({
      workspaceId: organization.id,
      syncId: input.syncId,
    });
  } catch (error) {
    log.error(error, "retryInterviewSyncAction failed");
    return { success: false, error: "Could not retry this synchronization." };
  }
}
