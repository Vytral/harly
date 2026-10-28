import type { Route } from "next";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCareerPageData } from "@/features/career-page/data";
import { PublicCareerPage } from "@/features/career-page/PublicCareerPage";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";
import { isPortalEnabled } from "@/lib/portal-auth";
import { publicBoardMetadata } from "@/features/career-page/seo";
import { isDemoMode } from "@harly/config";
import { DemoStylePreview } from "@/features/demo/DemoStylePreview";
import { parseDemoStyle } from "@/features/demo/sandbox-styles";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) return {};
  const data = await getCareerPageData(slug);
  return data
    ? publicBoardMetadata(data.workspace, data.config, { path: "" })
    : {};
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string }>;
}) {
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

  const jobs = data.jobs.map((job) => ({
    id: job.id,
    slug: job.slug,
    title: job.title,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
  }));

  // Public demo: the landing page is the canonical template workspace's real
  // careers page with a style picker, so visitors can preview each look before
  // opening their private sandbox.
  if (isDemoMode()) {
    const { style } = await searchParams;
    return (
      <DemoStylePreview
        workspace={data.workspace}
        jobs={jobs}
        config={data.config}
        portalEnabled={portalEnabled}
        initialStyle={parseDemoStyle(style)}
      />
    );
  }

  // Keep the self-hosted career site at `/`. Workspace-scoped routes remain
  // available at `/board/[workspaceSlug]`, while the root board preserves its
  // legacy `/jobs` and `/apply` links.
  return (
    <PublicCareerPage
      workspace={data.workspace}
      jobs={jobs}
      config={data.config}
      boardRoot=""
      portalEnabled={portalEnabled}
    />
  );
}
