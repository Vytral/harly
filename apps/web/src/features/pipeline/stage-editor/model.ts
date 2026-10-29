import {
  STAGE_KIND_LABELS,
  STAGE_KINDS,
  isTerminalStageKind,
  normalizeStageName,
  validatePipelineShape,
  type StageKind,
  type TerminalStageKind,
} from "@harly/db/stage-kind";

/**
 * Pure rules behind the stage editor. The server enforces every rule here
 * again (features/pipeline/stage-lifecycle.ts); this module exists so the UI
 * can explain a rule before the user hits it, and so the rules are unit tested
 * without a DOM. Keep it free of React and server-only imports.
 */

/** A stage as the editor sees it: the server summary, with a real `kind`. */
export type EditorStage = {
  id: string;
  name: string;
  color: string | null;
  kind: StageKind;
  order: number;
  archivedAt: Date | string | null;
  applicationCount: number;
  emailConfig: { candidateUpdatesEnabled: boolean };
};

export const STAGE_NAME_MAX_LENGTH = 120;

/**
 * Mirror of `normalizeStageEmailConfig` in `features/pipeline/data.ts`, which is
 * server-only. Keep the two in step: a missing or malformed value means enabled.
 */
export function normalizeEmailConfig(value: unknown): { candidateUpdatesEnabled: boolean } {
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return { candidateUpdatesEnabled: value.candidateUpdatesEnabled };
  }
  return { candidateUpdatesEnabled: true };
}

/** Converts a server stage summary (its email config is loosely typed) into the editor shape. */
export function toEditorStage(stage: Omit<EditorStage, "emailConfig"> & { emailConfig: unknown }): EditorStage {
  return { ...stage, emailConfig: normalizeEmailConfig(stage.emailConfig) };
}

/** One line per kind, written for a recruiter rather than for the schema. */
export const KIND_DESCRIPTIONS: Record<StageKind, string> = {
  applied: "New applications wait here for a first look.",
  screening: "Early review: résumé checks and short phone screens.",
  interview: "Candidates are in interviews or assessments.",
  offer: "An offer is being prepared, sent or negotiated.",
  hired: "An outcome. Candidates here are marked as hired.",
  rejected: "An outcome. Candidates here are marked as rejected.",
  withdrawn: "An outcome. The candidate has dropped out.",
  custom: "Any other step. Candidates stay active while they are here.",
};

/** Shown for outcome kinds: what moving a candidate here does to their status. */
export const OUTCOME_EXPLANATIONS: Record<TerminalStageKind, string> = {
  hired: "Counts as a hire. Moving a candidate here marks them hired and closes the application.",
  rejected:
    "Counts as a rejection. Moving a candidate here marks them rejected and closes the application.",
  withdrawn:
    "Counts as a withdrawal. Moving a candidate here marks them withdrawn and closes the application.",
};

/** Colours the recruiter can pick. The first six are the defaults new jobs start with. */
export const STAGE_SWATCHES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#E0F2FE", label: "Sky" },
  { value: "#F5F3FF", label: "Lavender" },
  { value: "#FEF3C7", label: "Amber" },
  { value: "#DCFCE7", label: "Mint" },
  { value: "#CCFBF1", label: "Teal" },
  { value: "#FEE2E2", label: "Rose" },
  { value: "#FCE7F3", label: "Pink" },
  { value: "#E4E4E7", label: "Stone" },
];

export const KIND_OPTIONS: ReadonlyArray<{ value: StageKind; label: string }> =
  STAGE_KINDS.map((kind) => ({ value: kind, label: STAGE_KIND_LABELS[kind] }));

export function isOutcomeKind(kind: StageKind): kind is TerminalStageKind {
  return isTerminalStageKind(kind);
}

function timeOf(value: Date | string | null): number {
  return value ? new Date(value).getTime() : 0;
}

/** Stages still in the pipeline, in board order. */
export function activeStagesOf(stages: readonly EditorStage[]): EditorStage[] {
  return stages.filter((stage) => !stage.archivedAt).sort((a, b) => a.order - b.order);
}

/** Archived stages, most recently archived first. Read only in the editor. */
export function archivedStagesOf(stages: readonly EditorStage[]): EditorStage[] {
  return stages
    .filter((stage) => stage.archivedAt)
    .sort((a, b) => timeOf(b.archivedAt) - timeOf(a.archivedAt));
}

export function countLabel(count: number): string {
  return count === 1 ? "1 candidate" : `${count} candidates`;
}

function holdLabel(count: number): string {
  return count === 1 ? "1 candidate holds this stage" : `${count} candidates hold this stage`;
}

export function describeShapeIssue(
  issue: ReturnType<typeof validatePipelineShape>[number],
): string {
  switch (issue.code) {
    case "no_active_stage":
      return "A pipeline needs at least one active stage that is not hired, rejected or withdrawn, so new candidates have somewhere to enter.";
    case "duplicate_name":
      return `Stage name "${issue.name}" is used more than once. Stage names must be unique.`;
    case "empty_name":
      return "Stage names cannot be empty.";
  }
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/**
 * Name rules the server also enforces: non-empty, at most 120 characters, and
 * unique among active stages ignoring case. `exceptStageId` is the stage being
 * renamed, so it does not clash with its own current name.
 */
export function checkStageName(
  input: string,
  activeList: readonly EditorStage[],
  exceptStageId?: string,
): NameCheck {
  const name = normalizeStageName(input);
  if (!name) return { ok: false, error: "Enter a stage name." };
  if (name.length > STAGE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Stage names can be ${STAGE_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  const key = name.toLowerCase();
  const clash = activeList.find(
    (stage) =>
      !stage.archivedAt &&
      stage.id !== exceptStageId &&
      normalizeStageName(stage.name).toLowerCase() === key,
  );
  if (clash) {
    return {
      ok: false,
      error: `Another active stage is already named "${clash.name}". Stage names must be unique.`,
    };
  }
  return { ok: true, name };
}

/* -------------------------------------------------------------------------- */
/* Kind changes                                                               */
/* -------------------------------------------------------------------------- */

export type KindDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Whether `stage` may change to `nextKind` right now. Mirrors
 * `updateStage`: a kind change that touches an outcome is refused while the
 * stage holds candidates, and the pipeline must keep an active entry stage.
 */
export function decideKindChange(input: {
  stage: EditorStage;
  stages: readonly EditorStage[];
  nextKind: StageKind;
}): KindDecision {
  const { stage, stages, nextKind } = input;
  if (nextKind === stage.kind) return { allowed: true };

  if (
    stage.applicationCount > 0 &&
    (isOutcomeKind(stage.kind) || isOutcomeKind(nextKind))
  ) {
    return {
      allowed: false,
      reason: `${holdLabel(stage.applicationCount)}. Moving them to or from an outcome needs a merge, so archive the stage and merge into a stage of the same kind.`,
    };
  }

  const next = [
    ...activeStagesOf(stages).filter((candidate) => candidate.id !== stage.id),
    { ...stage, kind: nextKind },
  ];
  const [issue] = validatePipelineShape(next);
  if (issue) return { allowed: false, reason: describeShapeIssue(issue) };
  return { allowed: true };
}

/** Why the kind select cannot offer outcomes (or leave one), when candidates are in the stage. */
export function kindLockNote(stage: EditorStage): string | null {
  if (stage.applicationCount === 0) return null;
  if (isOutcomeKind(stage.kind)) {
    return "Candidates hold this outcome. Archive the stage with a merge to change it.";
  }
  return "Outcome kinds are locked while candidates are here. Archive the stage with a merge to make one.";
}

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Active stages a stage's candidates may be merged into. A non-outcome stage
 * merges into any non-outcome stage; an outcome merges only into the same
 * outcome, so no candidate's status changes.
 */
export function validMergeTargets(
  source: Pick<EditorStage, "id" | "kind">,
  stages: readonly EditorStage[],
): EditorStage[] {
  const sourceIsOutcome = isOutcomeKind(source.kind);
  return activeStagesOf(stages).filter((target) => {
    if (target.id === source.id) return false;
    return sourceIsOutcome ? target.kind === source.kind : !isOutcomeKind(target.kind);
  });
}

export type ArchivePlan =
  | { mode: "confirm" }
  | {
      mode: "merge";
      targets: EditorStage[];
      defaultTargetId: string;
    }
  | { mode: "blocked"; reason: string };

export function planArchive(
  stage: EditorStage,
  stages: readonly EditorStage[],
): ArchivePlan {
  if (stage.applicationCount > 0) {
    const targets = validMergeTargets(stage, stages);
    if (targets.length === 0) {
      const count = countLabel(stage.applicationCount);
      return {
        mode: "blocked",
        reason: isOutcomeKind(stage.kind)
          ? `${count} would need another ${STAGE_KIND_LABELS[stage.kind]} stage to move to, so their outcome stays the same. Add one first.`
          : `${count} need another active stage to move to. Add one first.`,
      };
    }
    return { mode: "merge", targets, defaultTargetId: targets[0].id };
  }

  const remaining = activeStagesOf(stages).filter((candidate) => candidate.id !== stage.id);
  const [issue] = validatePipelineShape(remaining);
  if (issue) return { mode: "blocked", reason: describeShapeIssue(issue) };
  return { mode: "confirm" };
}

/** The sentence shown above the merge target select. */
export function mergeMessage(applicationCount: number, targetName: string): string {
  return `${countLabel(applicationCount)} will move to ${targetName}. History is kept.`;
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

function firstOutcomeIndex(list: readonly EditorStage[]): number {
  const index = list.findIndex((stage) => isOutcomeKind(stage.kind));
  return index === -1 ? list.length : index;
}

function lastNonOutcomeIndex(list: readonly EditorStage[]): number {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!isOutcomeKind(list[index].kind)) return index;
  }
  return -1;
}

/**
 * Valid indices for a stage of this kind in a list of the other active stages.
 * Active stages come before outcome stages, so the range stops at the boundary.
 */
export function insertionRange(
  others: readonly EditorStage[],
  kind: StageKind,
): { min: number; max: number; defaultIndex: number } {
  if (isOutcomeKind(kind)) {
    const min = lastNonOutcomeIndex(others) + 1;
    return { min, max: others.length, defaultIndex: others.length };
  }
  const max = firstOutcomeIndex(others);
  return { min: 0, max, defaultIndex: max };
}

/**
 * The ids of the active stages after moving `stageId` to `toIndex` (its index
 * in the final list), or null when the move is a no-op or crosses the boundary
 * between active and outcome stages. Pure reorder arithmetic.
 */
export function planMove(
  stages: readonly EditorStage[],
  stageId: string,
  toIndex: number,
): string[] | null {
  const active = activeStagesOf(stages);
  const from = active.findIndex((stage) => stage.id === stageId);
  if (from === -1 || toIndex === from) return null;

  const moved = active[from];
  const others = active.filter((stage) => stage.id !== stageId);
  const range = insertionRange(others, moved.kind);
  if (toIndex < range.min || toIndex > range.max || toIndex >= active.length) return null;

  const ids = others.map((stage) => stage.id);
  ids.splice(toIndex, 0, stageId);
  return ids;
}

/** Whether the stage can move one step up or down. Drives the arrow buttons. */
export function canStep(
  stages: readonly EditorStage[],
  stageId: string,
  direction: -1 | 1,
): boolean {
  const active = activeStagesOf(stages);
  const from = active.findIndex((stage) => stage.id === stageId);
  if (from === -1) return false;
  return planMove(stages, stageId, from + direction) !== null;
}

/** Position choices for a new stage: "Before <stage>" for each slot, or the end. */
export function positionOptions(
  stages: readonly EditorStage[],
  kind: StageKind,
): { options: Array<{ value: number; label: string }>; defaultValue: number } {
  const active = activeStagesOf(stages);
  const range = insertionRange(active, kind);
  const options: Array<{ value: number; label: string }> = [];
  for (let index = range.min; index <= range.max; index += 1) {
    const before = active[index];
    options.push({
      value: index,
      label: before ? `Before ${before.name}` : "At the end",
    });
  }
  return { options, defaultValue: range.defaultIndex };
}

/** Screen-reader sentence for a successful reorder. */
export function reorderAnnouncement(stages: readonly EditorStage[], stageId: string, ids: readonly string[]): string {
  const stage = stages.find((candidate) => candidate.id === stageId);
  const position = ids.indexOf(stageId) + 1;
  return `Moved ${stage?.name ?? "stage"} to position ${position} of ${ids.length}.`;
}

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * True when two stage lists describe different pipelines. Used after a failed
 * mutation to tell "another person changed the pipeline" apart from a plain
 * validation error.
 */
export function sameStageState(a: readonly EditorStage[], b: readonly EditorStage[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((stage) => [stage.id, stage]));
  return b.every((stage) => {
    const other = byId.get(stage.id);
    return (
      other !== undefined &&
      other.name === stage.name &&
      other.color === stage.color &&
      other.kind === stage.kind &&
      other.order === stage.order &&
      timeOf(other.archivedAt) === timeOf(stage.archivedAt) &&
      other.applicationCount === stage.applicationCount &&
      other.emailConfig.candidateUpdatesEnabled === stage.emailConfig.candidateUpdatesEnabled
    );
  });
}
