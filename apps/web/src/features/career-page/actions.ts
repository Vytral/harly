"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  careerPageConfigSchema,
  normalizeCareerPageConfig,
} from "@/features/career-page/config";

export type SaveCareerPageResult = { success: boolean; error?: string };

/**
 * Persist the career-page builder config. Guarded by `settings:edit`. The body
 * is validated + normalized before write; revalidates the public board so the
 * change is live immediately.
 */
export async function saveCareerPageConfigAction(
  rawConfig: unknown,
): Promise<SaveCareerPageResult> {
  let context;
  try {
    context = await requirePermission("settings:edit");
  } catch {
    return { success: false, error: "You do not have permission to edit settings." };
  }

  const parsed = careerPageConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return { success: false, error: "Some fields are invalid. Check and retry." };
  }

  const config = normalizeCareerPageConfig(parsed.data);
  const workspaceId = context.organization.id;

  try {
    const updated = await db
      .update(workspaceSettings)
      .set({ careerPageConfig: config, updatedAt: new Date() })
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .returning({ id: workspaceSettings.organizationId });

    if (updated.length === 0) {
      await db
        .insert(workspaceSettings)
        .values({ organizationId: workspaceId, careerPageConfig: config });
    }
  } catch (error) {
    console.error("Failed to save career page config", error);
    return { success: false, error: "Could not save. Try again." };
  }

  revalidatePath(`/board/${context.organization.slug}`);
  revalidatePath("/dashboard/career-page");
  return { success: true };
}
