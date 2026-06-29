import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

export type { Job } from "@/features/career-page/types";

export type ConfigUpdater = (producer: (draft: CareerPageConfig) => void) => void;

export type SectionProps = {
  config: CareerPageConfig;
  update: ConfigUpdater;
  workspace: WorkspaceBoardBranding & { id: string };
};
