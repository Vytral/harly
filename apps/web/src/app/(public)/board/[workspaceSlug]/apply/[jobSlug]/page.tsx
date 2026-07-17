import { notFound } from "next/navigation";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { isCareerPageConfigured } from "@/features/career-page/config";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { resolveTurnstileSiteKey } from "@/lib/turnstile";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default async function BoardApplyPage({ params }: { params: Promise<{ workspaceSlug: string; jobSlug: string }> }) {
  const { workspaceSlug, jobSlug } = await params;
  const detail = await getPublicJobDetail({ workspaceSlug, jobSlug });
  if (!detail) notFound();
  const { job, workspace, config } = detail;
  const form = <ApplyForm jobSlug={job.slug} workspaceSlug={workspace.slug} applicationConfig={normalizeJobApplicationConfig(job.applicationConfig)} turnstileSiteKey={await resolveTurnstileSiteKey(workspace.id)} legalConfigured={workspace.legalConfigured} consentCheckboxText={workspace.consentCheckboxText} legalPages={workspace.legalPages} />;
  if (isCareerPageConfigured(config)) return <JobChrome config={config} workspace={workspace} job={job} boardRoot={`/board/${workspaceSlug}`} activeTab="application">{form}</JobChrome>;
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">{form}</main>;
}
