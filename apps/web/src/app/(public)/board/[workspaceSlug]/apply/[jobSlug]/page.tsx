import { notFound } from "next/navigation";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { resolveTurnstileSiteKey } from "@/lib/turnstile";
import { isPortalEnabled } from "@/lib/portal-auth";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default async function BoardApplyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; jobSlug: string }>;
}) {
  const { workspaceSlug, jobSlug } = await params;
  const detail = await getPublicJobDetail({ workspaceSlug, jobSlug });
  if (!detail) notFound();
  const { job, workspace, config } = detail;
  const [turnstileSiteKey, portalEnabled] = await Promise.all([
    resolveTurnstileSiteKey(workspace.id),
    isPortalEnabled(),
  ]);
  const form = (
    <ApplyForm
      jobSlug={job.slug}
      workspaceSlug={workspace.slug}
      applicationConfig={normalizeJobApplicationConfig(job.applicationConfig)}
      turnstileSiteKey={turnstileSiteKey}
      legalConfigured={workspace.legalConfigured}
      consentCheckboxText={workspace.consentCheckboxText}
      legalPages={workspace.legalPages}
      legalBasePath={`/board/${workspace.slug}/legal`}
    />
  );
  return (
    <JobChrome
      config={config}
      workspace={workspace}
      job={job}
      boardRoot={`/board/${workspaceSlug}`}
      activeTab="application"
      portalEnabled={portalEnabled}
    >
      {form}
    </JobChrome>
  );
}
