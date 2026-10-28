import "server-only";

import { asc, eq } from "drizzle-orm";

import { demoWorkspaceId, isDemoMode } from "@harly/config";
import { db, organization } from "@harly/db";
import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";

export async function getPublicWorkspaceSlug(): Promise<string | null> {
  // The public demo hosts many disposable sandbox workspaces beside the one
  // canonical template. The root site must always render the template, so use
  // the pinned id when the operator set one instead of relying on "oldest".
  const pinned = isDemoMode() ? demoWorkspaceId() : null;
  if (pinned) {
    const [template] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, pinned))
      .limit(1);
    if (template) return template.slug;
  }

  const [first] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);

  return first?.slug ?? null;
}

export async function getPublicWorkspaceBoard() {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) return null;
  return listOpenJobsForWorkspaceSlug(slug);
}
