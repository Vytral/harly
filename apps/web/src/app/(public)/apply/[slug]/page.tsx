import { notFound } from "next/navigation";

import { ApplyForm } from "@/features/applications/ApplyForm";
import { BoardShell, BoardTopBar, BoardJobHeader } from "@/features/board/components";
import { getPublicJobDetail } from "@/features/jobs/data";
import { normalizeJobApplicationConfig, normalizeJobBoardConfig } from "@/features/jobs/config";

export const dynamic = "force-dynamic";

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const detail = await getPublicJobDetail({ jobSlug: slug });

  if (!detail) notFound();

  const { job, workspace } = detail;
  const boardConfig = normalizeJobBoardConfig(job.boardConfig);
  const applicationConfig = normalizeJobApplicationConfig(job.applicationConfig);

  const brandedWorkspace = {
    ...workspace,
    name: boardConfig.brandName ?? workspace.name,
    primaryColor: boardConfig.accentColor ?? workspace.primaryColor,
  };

  const boardRoot = "/";

  return (
    <BoardShell workspace={brandedWorkspace} boardRoot={boardRoot}>
      <BoardTopBar workspace={brandedWorkspace} boardRoot={boardRoot} backHref="/" />
      <BoardJobHeader workspace={brandedWorkspace} boardRoot={boardRoot} job={job} activeTab="application" />

      <main className="board-page-enter mx-auto max-w-2xl px-6 py-10">
        <ApplyForm
          jobSlug={job.slug}
          workspaceSlug={workspace.slug}
          applicationConfig={applicationConfig}
        />
      </main>
    </BoardShell>
  );
}
