import { notFound } from "next/navigation";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { BoardShell, BoardTopBar, BoardJobHeader } from "@/features/board/components";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig, normalizeJobBoardConfig } from "@/features/jobs/config";
import { isCareerPageConfigured } from "@/features/career-page/config";
import { JobChrome } from "@/features/career-page/job/JobChrome";
import { resolveTurnstileSiteKey } from "@/lib/turnstile";

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
  const turnstileSiteKey = await resolveTurnstileSiteKey(workspace.id);
  const boardRoot = "/";

  // Configured career template → per-template apply chrome wrapping the form.
  if (isCareerPageConfigured(config)) {
    return (
      <JobChrome
        config={config}
        workspace={workspace}
        job={job}
        boardRoot={boardRoot}
        activeTab="application"
      >
        <ApplyForm
          jobSlug={job.slug}
          workspaceSlug={workspace.slug}
          applicationConfig={applicationConfig}
          variant={config.template === "ashby" ? "ashby" : "default"}
          turnstileSiteKey={turnstileSiteKey}
        />
      </JobChrome>
    );
  }

  // Legacy board fallback.
  const boardConfig = normalizeJobBoardConfig(job.boardConfig);
  const brandedWorkspace = {
    ...workspace,
    name: boardConfig.brandName ?? workspace.name,
    primaryColor: boardConfig.accentColor ?? workspace.primaryColor,
  };

  return (
    <BoardShell workspace={brandedWorkspace} boardRoot={boardRoot}>
      <BoardTopBar workspace={brandedWorkspace} boardRoot={boardRoot} backHref="/" />
      <BoardJobHeader workspace={brandedWorkspace} boardRoot={boardRoot} job={job} activeTab="application" />

      <main className="board-page-enter mx-auto max-w-2xl px-6 py-10">
        <ApplyForm
          jobSlug={job.slug}
          workspaceSlug={workspace.slug}
          applicationConfig={applicationConfig}
          turnstileSiteKey={turnstileSiteKey}
        />
      </main>
    </BoardShell>
  );
}
