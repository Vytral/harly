"use server";

import { revalidatePath } from "next/cache";
import { db, workspaceSettings } from "@harly/db";
import { isDemoMode } from "@harly/config";

import { isLiveSandboxWorkspace } from "@/features/demo/sandbox-access";
import { requirePermission } from "@/features/workspaces/permissions-server";
import {
  careerPageConfigSchema,
  normalizeCareerPageConfig,
} from "@/features/career-page/config";
import { createLogger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";

const log = createLogger("career-page");

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

  // The public board is served under the demo's own domain. Only a visitor's
  // private sandbox may publish to it (never the shared template), and a
  // sandbox board is always kept out of search indexes.
  const sandbox = isDemoMode() && (await isLiveSandboxWorkspace(context.organization.id));
  if (isDemoMode() && !sandbox) {
    return { success: false, error: "This action is disabled in the demo." };
  }

  const parsed = careerPageConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return { success: false, error: "Some fields are invalid. Check and retry." };
  }

  const normalized = normalizeCareerPageConfig(parsed.data);
  const config = sandbox
    ? { ...normalized, seo: { ...normalized.seo, indexable: false } }
    : normalized;
  const workspaceId = context.organization.id;

  try {
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: workspaceId,
        careerPageConfig: config,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { careerPageConfig: config, updatedAt: new Date() },
      });
  } catch (error) {
    log.error(error, "saveCareerPageConfigAction failed");
    return { success: false, error: "Could not save. Try again." };
  }

  await logAuditEvent({
    workspaceId,
    actorId: context.user.id,
    actorEmail: context.user.email,
    action: "career_page.updated",
    resourceType: "career_page",
    resourceId: workspaceId,
    metadata: {
      template: config.template,
      indexable: config.seo.indexable,
    },
  });

  revalidatePath(`/board/${context.organization.slug}`);
  revalidatePath(`/board/${context.organization.slug}/jobs`);
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/sitemap.xml");
  revalidatePath("/dashboard/career-page");
  return { success: true };
}
