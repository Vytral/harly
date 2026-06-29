import { notFound } from "next/navigation";

import { CareerPageBuilder } from "@/features/career-page/builder/CareerPageBuilder";
import { getCareerPageData } from "@/features/career-page/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getLegalSettingsData } from "@/features/workspaces/legal-settings-actions";
import { VALID_LEGAL_SLUGS } from "@/features/legal/data";

export const dynamic = "force-dynamic";

export default async function CareerPagePage() {
  const { organization } = await getWorkspaceContext();
  const [data, legalSettings] = await Promise.all([
    getCareerPageData(organization.slug),
    getLegalSettingsData(),
  ]);

  if (!data) {
    notFound();
  }

  const availableLegalPages = VALID_LEGAL_SLUGS.filter(
    (slug) => {
      const key = slug
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        .replace(/^[a-z]/, (c) => c.toUpperCase())
        .replace(/^./, (c) => c.toLowerCase()) as keyof typeof legalSettings.legalPages;
      return Boolean(legalSettings.legalPages[key]);
    },
  );

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
      availableLegalPages={availableLegalPages}
    />
  );
}
