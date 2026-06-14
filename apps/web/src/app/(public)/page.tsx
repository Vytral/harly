import type { Route } from "next";
import { redirect } from "next/navigation";

import { getCareerPageData } from "@/features/career-page/data";
import { PublicCareerPage } from "@/features/career-page/PublicCareerPage";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) {
    redirect("/setup" as Route);
  }

  const data = await getCareerPageData(slug);
  if (!data) {
    redirect("/setup" as Route);
  }

  // Root-relative board: apply links resolve to `/apply/[slug]`.
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
    />
  );
}
