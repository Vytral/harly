"use client";

import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { CareerPageConfig } from "./config";
import type { Job } from "./types";
import { ThemeWrapper } from "./ThemeWrapper";
import { PlayfulTemplate } from "./templates/PlayfulTemplate";
import { MinimalTemplate } from "./templates/MinimalTemplate";
import { AshbyTemplate } from "./templates/AshbyTemplate";
import { FolioTemplate } from "./templates/FolioTemplate";

/**
 * Renders the public career page from live config. Switch picks the template
 * component based on config.template, wraps it in ThemeWrapper to apply
 * mode/background/font. All templates receive the same props (config-driven).
 * Greenhouse configs fall back to Minimal.
 */
export function CareerPageRender({
  config,
  workspace,
  jobs,
  boardRoot,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  boardRoot: string;
}) {
  const templateMap = {
    minimal: MinimalTemplate,
    playful: PlayfulTemplate,
    ashby: AshbyTemplate,
    folio: FolioTemplate,
  } as const;

  const TemplateComponent =
    config.template !== "" && config.template in templateMap
      ? templateMap[config.template as keyof typeof templateMap]
      : MinimalTemplate;

  return (
    <ThemeWrapper config={config}>
      <TemplateComponent
        config={config}
        workspace={workspace}
        jobs={jobs}
        boardRoot={boardRoot}
      />
    </ThemeWrapper>
  );
}
