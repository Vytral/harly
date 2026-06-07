import type { Route } from "next";
import { redirect } from "next/navigation";

import {
  BoardHero,
  BoardMinimalHeader,
  BoardShell,
  JobTable,
} from "@/features/board/components";
import { getPublicWorkspaceBoard } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getPublicWorkspaceBoard();

  if (!result?.workspace) {
    redirect("/setup" as Route);
  }

  const { workspace, jobs } = result;
  const isHero = workspace.boardStyle === "hero";
  const boardRoot = "/";

  return (
    <BoardShell workspace={workspace} boardRoot={boardRoot}>
      {isHero ? (
        <BoardHero workspace={workspace} boardRoot={boardRoot} showCta={jobs.length > 0} />
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
