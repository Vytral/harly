import {
  BoardHero,
  BoardMinimalHeader,
  BoardShell,
  JobTable,
} from "@/features/board/components";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import { isCareerPageConfigured, type CareerPageConfig } from "./config";
import { CareerPageRender } from "./CareerPageRender";

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
};

/**
 * The public careers surface. Used by both the workspace homepage (`/`) and the
 * slugged board (`/board/[slug]`) so a configured career-page template applies
 * everywhere. Falls back to the legacy board when no template is chosen.
 */
export function PublicCareerPage({
  workspace,
  jobs,
  config,
  boardRoot,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  boardRoot: string;
}) {
  if (isCareerPageConfigured(config)) {
    return (
      <CareerPageRender
        workspace={workspace}
        jobs={jobs}
        config={config}
        boardRoot={boardRoot}
      />
    );
  }

  const isHero = workspace.boardStyle === "hero";
  return (
    <BoardShell workspace={workspace} boardRoot={boardRoot || "/"}>
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
          boardRoot={boardRoot || "/"}
          jobs={jobs}
          style={workspace.boardStyle}
        />
      </div>
    </BoardShell>
  );
}
