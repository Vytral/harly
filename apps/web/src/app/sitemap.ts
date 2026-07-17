import type { MetadataRoute } from "next";
import { and, eq, isNull } from "drizzle-orm";

import { db, jobs, organization, workspaceSettings } from "@harly/db";
import { normalizeCareerPageConfig } from "@/features/career-page/config";

const origin = (process.env.HARLY_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Queries the DB at request time; must never be prerendered at build (no DB in
// the image) — otherwise `next build` fails with ECONNREFUSED on :5432.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const workspaces = await db.select({ id: organization.id, slug: organization.slug, updatedAt: workspaceSettings.updatedAt, config: workspaceSettings.careerPageConfig }).from(organization).leftJoin(workspaceSettings, eq(workspaceSettings.organizationId, organization.id));
  const entries: MetadataRoute.Sitemap = [];
  for (const workspace of workspaces) {
    if (!normalizeCareerPageConfig(workspace.config).seo.indexable) continue;
    const base = `${origin}/board/${workspace.slug}`;
    entries.push({ url: base, lastModified: workspace.updatedAt ?? new Date(), changeFrequency: "weekly", priority: 0.8 });
    const openJobs = await db.select({ slug: jobs.slug, updatedAt: jobs.updatedAt }).from(jobs).where(and(eq(jobs.workspaceId, workspace.id), eq(jobs.status, "open"), isNull(jobs.deletedAt)));
    entries.push(...openJobs.map((job) => ({ url: `${base}/jobs/${job.slug}`, lastModified: job.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })));
  }
  return entries;
}
