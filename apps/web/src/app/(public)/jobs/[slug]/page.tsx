import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublicJobDetail } from "@/features/jobs/data";
import { PublicJobOverview } from "@/features/career-page/job/PublicJobOverview";
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

  return (
    <PublicJobOverview
      detail={detail}
      boardRoot="/"
      portalEnabled={portalEnabled}
    />
  );
}
