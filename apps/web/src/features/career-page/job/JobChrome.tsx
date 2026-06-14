import type { CSSProperties } from "react";

import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { CareerPageConfig } from "../config";
import { ThemeWrapper } from "../ThemeWrapper";
import { JobShell } from "./JobShell";
import type { JobLike } from "./jobMeta";

/**
 * Per-template public job chrome. Wraps the active tab's content in the
 * workspace's career template look: ThemeWrapper (mode/bg/font) + a shell picked
 * by `config.template` (playful → PlayfulJobShell, else StructuredJobShell).
 * Exposes the accent as `--board-primary` so shared form/buttons pick it up.
 */
export function JobChrome({
  config,
  workspace,
  job,
  boardRoot,
  activeTab,
  children,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  job: JobLike;
  boardRoot: string;
  activeTab: "overview" | "application";
  children: React.ReactNode;
}) {
  const accent = config.theme.accent ?? workspace.primaryColor;

  const vars = {
    "--board-primary": accent,
    "--board-primary-foreground": "#ffffff",
  } as CSSProperties;

  return (
    <ThemeWrapper config={config}>
      <div style={vars}>
        <JobShell
          config={config}
          workspace={workspace}
          job={job}
          boardRoot={boardRoot}
          activeTab={activeTab}
          playful={config.template === "playful"}
        >
          {children}
        </JobShell>
      </div>
    </ThemeWrapper>
  );
}
