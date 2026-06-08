import { notFound } from "next/navigation";

import {
  BoardHero,
  BoardMinimalHeader,
  BoardShell,
  JobTable,
} from "@/features/board/components";
import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { slug } = await params;
  const { workspace, jobs } = await listOpenJobsForWorkspaceSlug(slug);

  if (!workspace) {
    notFound();
  }

  const isHero = workspace.boardStyle === "hero";
  const boardRoot = `/board/${workspace.slug}`;

  return (
    <BoardShell workspace={workspace} boardRoot={boardRoot}>
      {isHero ? (
        <BoardHero workspace={workspace} showCta={jobs.length > 0} />
      ) : (
        <BoardMinimalHeader workspace={workspace} />
      )}

      {workspace.description && isHero ? (
        <section className="mx-auto max-w-3xl px-6 pt-12">
          <p className="whitespace-pre-line text-base leading-relaxed text-zinc-700">
            {workspace.description}
          </p>
        </section>
      ) : null}

      <div id="open-roles">
        <JobTable
          boardRoot={boardRoot}
          jobs={jobs.map((job) => ({
            id: job.id,
            slug: job.slug,
            title: job.title,
            department: job.department,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
          }))}
          style={workspace.boardStyle}
        />
      </div>
    </BoardShell>
  );
}
