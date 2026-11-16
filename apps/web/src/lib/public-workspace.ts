import "server-only";

import { asc, eq } from "drizzle-orm";

import { demoWorkspaceId, isDemoMode } from "@harly/config";
import { db, organization } from "@harly/db";
import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";

/**
 * The workspace anonymous, key-less public entrypoints serve. This is the one
 * resolver for it (root site, public API without a key): the pinned demo
 * template when set, otherwise the oldest organization.
 */
export async function getPublicWorkspace(): Promise<{
  id: string;
  slug: string;
} | null> {
  // The public demo hosts many disposable sandbox workspaces beside the one
  // canonical template. The root site must always render the template, so use
  // the pinned id when the operator set one instead of relying on "oldest".
  const pinned = isDemoMode() ? demoWorkspaceId() : null;
  if (pinned) {
    const [template] = await db
      .select({ id: organization.id, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, pinned))
      .limit(1);
    if (template) return template;
  }

  const [first] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);

  return first ?? null;
}

export async function getPublicWorkspaceSlug(): Promise<string | null> {
  return (await getPublicWorkspace())?.slug ?? null;
}

export async function getPublicWorkspaceBoard() {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) return null;
  return listOpenJobsForWorkspaceSlug(slug);
}
