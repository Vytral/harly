"use server";

import { revalidatePath } from "next/cache";

import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { requireWorkspaceRole } from "@/features/workspaces/context";
import { createLogger } from "@/lib/logger";

import {
  applyChecklistAction,
  NO_CHECKLIST_PREFERENCES,
  type ChecklistAction,
} from "./checklist-model";
import {
  addSkippedChecklistKey,
  readChecklistPreferences,
  writeChecklistPreferences,
} from "./checklist-state";

const log = createLogger("setup-checklist");

export type ChecklistActionResult = { ok: boolean; error?: string };

async function runChecklistAction(
  action: ChecklistAction,
): Promise<ChecklistActionResult> {
  try {
    assertNotDemo();
    const { organization, user } = await requireWorkspaceRole(["owner", "admin"]);
    const scope = { workspaceId: organization.id, userId: user.id };

    if (action.type === "skip") {
      // A skip merges into the stored list in one statement, so concurrent skips
      // cannot overwrite each other. The model still rejects required steps.
      const check = applyChecklistAction(NO_CHECKLIST_PREFERENCES, action);
      if (!check.ok) return { ok: false, error: check.error };
      await addSkippedChecklistKey({ ...scope, key: action.key });
    } else {
      const current = await readChecklistPreferences(scope);
      const transition = applyChecklistAction(current, action);
      if (!transition.ok) return { ok: false, error: transition.error };
      await writeChecklistPreferences({
        ...scope,
        preferences: transition.preferences,
      });
    }
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    log.error(error, "setup checklist action failed");
    return { ok: false, error: error instanceof Error ? error.message : "Failed." };
  }
}

/** Hide the checklist for this member in this workspace. */
export async function dismissSetupChecklistAction(): Promise<ChecklistActionResult> {
  return runChecklistAction({ type: "dismiss" });
}

/** Bring the checklist back, including steps that were skipped. */
export async function restoreSetupChecklistAction(): Promise<ChecklistActionResult> {
  return runChecklistAction({ type: "restore" });
}

/** Skip one optional step. Required steps are rejected by the model. */
export async function skipSetupChecklistItemAction(
  key: string,
): Promise<ChecklistActionResult> {
  return runChecklistAction({ type: "skip", key });
}
