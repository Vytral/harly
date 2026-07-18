import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCareerPageData } from "@/features/career-page/data";
import { PublicCareerPage } from "@/features/career-page/PublicCareerPage";
import { publicBoardMetadata } from "@/features/career-page/seo";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ workspaceSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const data = await getCareerPageData(workspaceSlug);
  return data ? publicBoardMetadata(data.workspace, data.config) : {};
}

export default async function BoardPage({ params }: Props) {
  const { workspaceSlug } = await params;
  const [data, portalEnabled] = await Promise.all([
    getCareerPageData(workspaceSlug),
    isPortalEnabled(),
  ]);
  if (!data) notFound();
  const boardRoot = `/board/${workspaceSlug}`;
  return <PublicCareerPage workspace={data.workspace} jobs={data.jobs.map(({ id, slug, title, department, location, employmentType, workplaceType }) => ({ id, slug, title, department, location, employmentType, workplaceType }))} config={data.config} boardRoot={boardRoot} portalEnabled={portalEnabled} />;
}
