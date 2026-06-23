import { notFound } from "next/navigation";

import { getCareerPageData } from "@/features/career-page/data";
import { PublicCareerPage } from "@/features/career-page/PublicCareerPage";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { slug } = await params;
  const [data, portalEnabled] = await Promise.all([
    getCareerPageData(slug),
    isPortalEnabled(),
  ]);

  if (!data) {
    notFound();
  }

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
      boardRoot={`/board/${data.workspace.slug}`}
      portalEnabled={portalEnabled}
    />
  );
}
