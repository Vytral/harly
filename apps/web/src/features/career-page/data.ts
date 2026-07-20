import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db, workspaceSettings } from "@harly/db";

import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";
import {
  normalizeCareerPageConfig,
  type CareerPageConfig,
} from "./config";

/**
 * Everything the public career page needs: branding + open jobs (reused from
 * the existing board query) plus the workspace's career-page config.
 */
export const getCareerPageData = cache(async function getCareerPageData(slug: string): Promise<{
  workspace: NonNullable<
    Awaited<ReturnType<typeof listOpenJobsForWorkspaceSlug>>["workspace"]
  >;
  jobs: Awaited<ReturnType<typeof listOpenJobsForWorkspaceSlug>>["jobs"];
  config: CareerPageConfig;
} | null> {
  const { workspace, jobs } = await listOpenJobsForWorkspaceSlug(slug);
  if (!workspace) return null;

  const [settings] = await db
    .select({ config: workspaceSettings.careerPageConfig })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspace.id))
    .limit(1);

  return {
    workspace,
    jobs,
    config: normalizeCareerPageConfig(settings?.config),
  };
});
