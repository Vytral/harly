import "server-only";

import { asc } from "drizzle-orm";

import { db, organization } from "@openhire/db";
import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";

export async function getPublicWorkspaceSlug(): Promise<string | null> {
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
