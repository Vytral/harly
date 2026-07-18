import type { Route } from "next";
import { redirect } from "next/navigation";

import { getCareerPageData } from "@/features/career-page/data";
import { PublicCareerPage } from "@/features/career-page/PublicCareerPage";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) {
    redirect("/setup" as Route);
  }

  const [data, portalEnabled] = await Promise.all([
    getCareerPageData(slug),
    isPortalEnabled(),
  ]);
  if (!data) {
    redirect("/setup" as Route);
  }

  // Keep the self-hosted career site at `/`. Workspace-scoped routes remain
  // available at `/board/[workspaceSlug]`, while the root board preserves its
  // legacy `/jobs` and `/apply` links.
  return (
    <PublicCareerPage
      workspace={data.workspace}
      jobs={data.jobs.map((job) => ({
        id: job.id,
        slug: job.slug,
        title: job.title,
        department: job.department,
        location: job.location,
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
      }))}
      config={data.config}
      boardRoot=""
      portalEnabled={portalEnabled}
    />
  );
}
