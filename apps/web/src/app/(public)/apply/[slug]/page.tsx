import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { resolveCaptchaSiteKey } from "@/lib/captcha";
import { isPortalEnabled } from "@/lib/portal-auth";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: true } };

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const workspaceSlug = await getPublicWorkspaceSlug();
  const detail = workspaceSlug
    ? await getPublicJobDetail({ jobSlug: slug, workspaceSlug })
    : null;

  if (!detail) notFound();

  const { job, workspace, config } = detail;
  const applicationConfig = normalizeJobApplicationConfig(job.applicationConfig);
  const [captcha, portalEnabled] = await Promise.all([
    resolveCaptchaSiteKey(workspace.id),
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
        variant={config.template === "ashby" ? "ashby" : "default"}
        captchaProvider={captcha?.provider ?? null}
        captchaSiteKey={captcha?.siteKey ?? null}
        legalConfigured={workspace.legalConfigured}
        consentCheckboxText={workspace.consentCheckboxText}
        legalPages={workspace.legalPages}
      />
    </JobChrome>
  );
}
