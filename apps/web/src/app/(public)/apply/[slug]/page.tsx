import { notFound } from "next/navigation";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { resolveTurnstileSiteKey } from "@/lib/turnstile";
import { isPortalEnabled } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const detail = await getPublicJobDetail({ jobSlug: slug });

  if (!detail) notFound();

  const { job, workspace, config } = detail;
  const applicationConfig = normalizeJobApplicationConfig(job.applicationConfig);
  const [turnstileSiteKey, portalEnabled] = await Promise.all([
    resolveTurnstileSiteKey(workspace.id),
    isPortalEnabled(),
  ]);

  return (
    <JobChrome
      config={config}
      workspace={workspace}
      job={job}
      boardRoot="/"
      activeTab="application"
      portalEnabled={portalEnabled}
    >
      <ApplyForm
        jobSlug={job.slug}
        workspaceSlug={workspace.slug}
        applicationConfig={applicationConfig}
        variant={
          config.template === "ashby" ? "ashby"
          : config.template === "folio" ? "folio"
          : "default"
        }
        turnstileSiteKey={turnstileSiteKey}
        legalConfigured={workspace.legalConfigured}
        consentCheckboxText={workspace.consentCheckboxText}
        legalPages={workspace.legalPages}
      />
    </JobChrome>
  );
}
