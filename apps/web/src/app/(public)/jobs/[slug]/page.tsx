import { notFound } from "next/navigation";

import { getPublicJobDetail } from "@/features/jobs/data";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { JobOverviewBody } from "@/features/career-page/job/JobOverviewBody";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

type JobDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { slug } = await params;
  const [detail, portalEnabled] = await Promise.all([
    getPublicJobDetail({ jobSlug: slug }),
    isPortalEnabled(),
  ]);

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
