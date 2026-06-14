import { notFound } from "next/navigation";

import { CareerPageBuilder } from "@/features/career-page/builder/CareerPageBuilder";
import { getCareerPageData } from "@/features/career-page/data";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

export default async function CareerPagePage() {
  const { organization } = await getWorkspaceContext();
  const data = await getCareerPageData(organization.slug);

  if (!data) {
    notFound();
  }

  return (
    <CareerPageBuilder
      initialConfig={data.config}
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
      slug={organization.slug}
    />
  );
}
