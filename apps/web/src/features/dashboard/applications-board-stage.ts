import { effectiveStageKind, type StageKind } from "@harly/db/stage-kind";

/**
 * Stage filter values for the dashboard board. Client-safe and pure, so the
 * filter rules are unit tested without the database.
 *
 * A stage filters by its kind, so "Screening" and a renamed "Phone screen" that
 * is still a screening stage are the same choice. Custom stages have no kind
 * meaning to share, so they filter by their own name. URLs written before kinds
 * existed carry display names; those still match because the name is checked too.
 */

export type StageFilterSource = {
  kind: StageKind | null;
  name: string;
};

export function stageFilterValue(stage: StageFilterSource): string {
  const kind = effectiveStageKind({ kind: stage.kind, name: stage.name });
  return kind === "custom" ? stage.name : kind;
}

export function matchesStageFilter(
  application: { stageKind: StageKind | null; stageName: string | null },
  filter: string,
): boolean {
  return (
    application.stageKind === filter ||
    (application.stageName !== null && application.stageName === filter)
  );
}
