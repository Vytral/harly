import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PublicJobOverview } from "@/features/career-page/job/PublicJobOverview";
import { publicJobMetadata } from "@/features/career-page/seo";
import { getPublicJobDetail } from "@/features/jobs/data";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ workspaceSlug: string; jobSlug: string }> };

async function getDetail(params: Props["params"]) {
  const { workspaceSlug, jobSlug } = await params;
  return getPublicJobDetail({ workspaceSlug, jobSlug });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await getDetail(params);
  return detail ? publicJobMetadata(detail.workspace, detail.config, detail.job) : {};
}

export default async function BoardJobPage({ params }: Props) {
  const [detail, portalEnabled] = await Promise.all([
    getDetail(params),
    isPortalEnabled(),
  ]);
  if (!detail) notFound();
  const { workspaceSlug } = await params;
  return (
    <PublicJobOverview
      detail={detail}
      boardRoot={`/board/${workspaceSlug}`}
      portalEnabled={portalEnabled}
    />
  );
}
