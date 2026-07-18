import type { CSSProperties } from "react";

import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { CareerPageConfig, CareerTemplate } from "../config";
import { ThemeWrapper } from "../ThemeWrapper";
import { JobShell, type JobShellVariant } from "./JobShell";
import type { JobLike } from "./jobMeta";

/** Map a career template to its job-page chrome variant. */
function templateToVariant(t: CareerTemplate | ""): JobShellVariant {
  if (t === "playful") return "playful";
  if (t === "folio") return "folio";
  return "structured";
}

/**
 * Per-template public job chrome. Wraps the active tab's content in the
 * workspace's career template look: ThemeWrapper (mode/bg/font) + a shell picked
 * by `config.template` (playful → hero band, folio → masthead bar, else
 * structured header). Exposes the accent as `--board-primary` so shared
 * form/buttons pick it up.
 */
export function JobChrome({
  config,
  workspace,
  job,
  boardRoot,
  activeTab,
  portalEnabled = false,
  children,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  job: JobLike;
  boardRoot: string;
  activeTab: "overview" | "application";
  portalEnabled?: boolean;
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
          variant={templateToVariant(config.template)}
          portalEnabled={portalEnabled}
        >
          {children}
        </JobShell>
      </div>
    </ThemeWrapper>
  );
}
