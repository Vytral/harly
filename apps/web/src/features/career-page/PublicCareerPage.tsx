import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { CareerPageConfig } from "./config";
import type { Job } from "./types";
import { CareerPageRender } from "./CareerPageRender";

/**
 * The public careers surface. Used by both the workspace homepage (`/`) and the
 * slugged board (`/board/[slug]`). Always renders the career-page template; an
 * unconfigured workspace (`template === ""`) falls back to the Minimal template
 * inside {@link CareerPageRender}, so a fresh self-host deployment shows a real
 * career page instead of a bare board.
 */
export function PublicCareerPage({
  workspace,
  jobs,
  config,
  boardRoot,
  portalEnabled,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  boardRoot: string;
  portalEnabled?: boolean;
}) {
  return (
    <CareerPageRender
      workspace={workspace}
      jobs={jobs}
      config={config}
      boardRoot={boardRoot}
      portalEnabled={portalEnabled}
    />
  );
}
