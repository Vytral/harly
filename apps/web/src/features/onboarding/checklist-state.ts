import "server-only";

import { and, eq, sql } from "drizzle-orm";

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

/**
 * Add one skipped step in a single statement. The stored list is merged inside
 * the upsert, against the row as it is committed, so two skips racing on the
 * same member both survive. A read-modify-write would let the later write drop
 * the earlier key.
 */
export async function addSkippedChecklistKey(input: {
  workspaceId: string;
  userId: string;
  key: string;
}): Promise<void> {
  await db
    .insert(setupChecklistStates)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      skippedKeys: [input.key],
    })
    .onConflictDoUpdate({
      target: [setupChecklistStates.workspaceId, setupChecklistStates.userId],
      set: {
        skippedKeys: sql`(select coalesce(jsonb_agg(distinct merged.key order by merged.key), '[]'::jsonb) from jsonb_array_elements_text(${setupChecklistStates.skippedKeys} || excluded.skipped_keys) as merged(key))`,
        updatedAt: new Date(),
      },
    });
}
