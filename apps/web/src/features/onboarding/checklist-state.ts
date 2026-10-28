import "server-only";

import { and, eq } from "drizzle-orm";

import { db, setupChecklistStates } from "@harly/db";

import {
  NO_CHECKLIST_PREFERENCES,
  normalizeSkippedKeys,
  type ChecklistPreferences,
} from "./checklist-model";

/** Dismiss and skip state for one member in one workspace. */
export async function readChecklistPreferences(input: {
  workspaceId: string;
  userId: string;
}): Promise<ChecklistPreferences> {
  const [row] = await db
    .select({
      dismissedAt: setupChecklistStates.dismissedAt,
      skippedKeys: setupChecklistStates.skippedKeys,
    })
    .from(setupChecklistStates)
    .where(
      and(
        eq(setupChecklistStates.workspaceId, input.workspaceId),
        eq(setupChecklistStates.userId, input.userId),
      ),
    )
    .limit(1);

  if (!row) return NO_CHECKLIST_PREFERENCES;
  return {
    dismissed: row.dismissedAt !== null,
    skipped: normalizeSkippedKeys(row.skippedKeys),
  };
}

export async function writeChecklistPreferences(input: {
  workspaceId: string;
  userId: string;
  preferences: ChecklistPreferences;
}): Promise<void> {
  const now = new Date();
  const dismissedAt = input.preferences.dismissed ? now : null;
  await db
    .insert(setupChecklistStates)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      dismissedAt,
      skippedKeys: input.preferences.skipped,
    })
    .onConflictDoUpdate({
      target: [setupChecklistStates.workspaceId, setupChecklistStates.userId],
      set: {
        dismissedAt,
        skippedKeys: input.preferences.skipped,
        updatedAt: now,
      },
    });
}
