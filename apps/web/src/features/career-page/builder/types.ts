import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

export type { Job } from "@/features/career-page/types";

export type ConfigUpdater = (producer: (draft: CareerPageConfig) => void) => void;

export type BuilderWorkspace = WorkspaceBoardBranding & { id: string };

/** Left-rail sections, in display order. */
export type BuilderSection =
  | "template"
  | "content"
  | "sections"
  | "jobs"
  | "design"
  | "footer"
  | "discovery";

export type SectionProps = {
  config: CareerPageConfig;
  update: ConfigUpdater;
  workspace: BuilderWorkspace;
};
