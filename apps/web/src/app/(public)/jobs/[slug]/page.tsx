import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublicJobDetail } from "@/features/jobs/data";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { JobOverviewBody } from "@/features/career-page/job/JobOverviewBody";
import { publicJobMetadata } from "@/features/career-page/seo";
import { isPortalEnabled } from "@/lib/portal-auth";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

type JobDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: JobDetailPageProps): Promise<Metadata> {
  const [{ slug }, workspaceSlug] = await Promise.all([
    params,
    getPublicWorkspaceSlug(),
  ]);
  const detail = workspaceSlug
    ? await getPublicJobDetail({ jobSlug: slug, workspaceSlug })
    : null;
  return detail
    ? publicJobMetadata(detail.workspace, detail.config, detail.job, { path: "" })
    : {};
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { slug } = await params;
  const [workspaceSlug, portalEnabled] = await Promise.all([
    getPublicWorkspaceSlug(),
    isPortalEnabled(),
  ]);
  const detail = workspaceSlug
    ? await getPublicJobDetail({ jobSlug: slug, workspaceSlug })
    : null;

  if (!detail) notFound();

  const { job, workspace, config } = detail;

  return (
    <JobChrome
      config={config}
      workspace={workspace}
      job={job}
      boardRoot="/"
      activeTab="overview"
      portalEnabled={portalEnabled}
    >
      <JobOverviewBody job={job} />
    </JobChrome>
  );
}
