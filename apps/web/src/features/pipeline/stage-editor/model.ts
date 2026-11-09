import type { useTranslations } from "next-intl";

import {
  STAGE_KINDS,
  isTerminalStageKind,
  normalizeStageName,
  validatePipelineShape,
  type StageKind,
  type TerminalStageKind,
} from "@harly/db/stage-kind";

/** Translator for the `labels.pipeline.stageEditor` namespace. */
export type EditorTranslator = ReturnType<typeof useTranslations>;

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

/**
 * Colours the recruiter can pick. The first six are the defaults new jobs start with.
 * `id` names the colour in `labels.pipeline.stageEditor.swatches`.
 */
export const STAGE_SWATCHES: ReadonlyArray<{
  value: string;
  id: "sky" | "lavender" | "amber" | "mint" | "teal" | "rose" | "pink" | "stone";
}> = [
  { value: "#E0F2FE", id: "sky" },
  { value: "#F5F3FF", id: "lavender" },
  { value: "#FEF3C7", id: "amber" },
  { value: "#DCFCE7", id: "mint" },
  { value: "#CCFBF1", id: "teal" },
  { value: "#FEE2E2", id: "rose" },
  { value: "#FCE7F3", id: "pink" },
  { value: "#E4E4E7", id: "stone" },
];

/** Kind ids in picker order. Labels are resolved at render from `labels.pipeline.stageEditor.kinds`. */
export const KIND_OPTIONS: readonly StageKind[] = STAGE_KINDS;

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

export function describeShapeIssue(
  issue: ReturnType<typeof validatePipelineShape>[number],
  t: EditorTranslator,
): string {
  switch (issue.code) {
    case "no_active_stage":
      return t("shapeNoActiveStage");
    case "duplicate_name":
      return t("shapeDuplicateName", { name: issue.name });
    case "empty_name":
      return t("shapeEmptyName");
  }
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

export type NameFailure =
  | { ok: false; code: "empty" }
  | { ok: false; code: "tooLong" }
  | { ok: false; code: "duplicate"; existingName: string };

export type NameCheck = { ok: true; name: string } | NameFailure;

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
  if (!name) return { ok: false, code: "empty" };
  if (name.length > STAGE_NAME_MAX_LENGTH) return { ok: false, code: "tooLong" };
  const key = name.toLowerCase();
  const clash = activeList.find(
    (stage) =>
      !stage.archivedAt &&
      stage.id !== exceptStageId &&
      normalizeStageName(stage.name).toLowerCase() === key,
  );
  if (clash) return { ok: false, code: "duplicate", existingName: clash.name };
  return { ok: true, name };
}

/** The sentence for a failed name check. */
export function nameErrorMessage(failure: NameFailure, t: EditorTranslator): string {
  switch (failure.code) {
    case "empty":
      return t("nameEmpty");
    case "tooLong":
      return t("nameTooLong", { max: STAGE_NAME_MAX_LENGTH });
    case "duplicate":
      return t("nameDuplicate", { name: failure.existingName });
  }
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
export function decideKindChange(
  input: {
    stage: EditorStage;
    stages: readonly EditorStage[];
    nextKind: StageKind;
  },
  t: EditorTranslator,
): KindDecision {
  const { stage, stages, nextKind } = input;
  if (nextKind === stage.kind) return { allowed: true };

  if (
    stage.applicationCount > 0 &&
    (isOutcomeKind(stage.kind) || isOutcomeKind(nextKind))
  ) {
    return {
      allowed: false,
      reason: t("kindChangeNeedsMerge", { count: stage.applicationCount }),
    };
  }

  const next = [
    ...activeStagesOf(stages).filter((candidate) => candidate.id !== stage.id),
    { ...stage, kind: nextKind },
  ];
  const [issue] = validatePipelineShape(next);
  if (issue) return { allowed: false, reason: describeShapeIssue(issue, t) };
  return { allowed: true };
}

/** Why the kind select cannot offer outcomes (or leave one), when candidates are in the stage. */
export function kindLockNote(stage: EditorStage, t: EditorTranslator): string | null {
  if (stage.applicationCount === 0) return null;
  if (isOutcomeKind(stage.kind)) return t("kindLockedOutcome");
  return t("kindLockedActive");
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

/**
 * `kindLabel` is the localized name of the stage's kind, used only in the
 * outcome sentence. Pass the translation of `labels.pipeline.stageKinds`.
 */
export function planArchive(
  stage: EditorStage,
  stages: readonly EditorStage[],
  t: EditorTranslator,
  kindLabel: string,
): ArchivePlan {
  if (stage.applicationCount > 0) {
    const targets = validMergeTargets(stage, stages);
    if (targets.length === 0) {
      return {
        mode: "blocked",
        reason: isOutcomeKind(stage.kind)
          ? t("archiveBlockedOutcome", { count: stage.applicationCount, kind: kindLabel })
          : t("archiveBlockedActive", { count: stage.applicationCount }),
      };
    }
    return { mode: "merge", targets, defaultTargetId: targets[0].id };
  }

  const remaining = activeStagesOf(stages).filter((candidate) => candidate.id !== stage.id);
  const [issue] = validatePipelineShape(remaining);
  if (issue) return { mode: "blocked", reason: describeShapeIssue(issue, t) };
  return { mode: "confirm" };
}

/** The sentence shown above the merge target select. */
export function mergeMessage(applicationCount: number, targetName: string, t: EditorTranslator): string {
  return t("mergeMessage", { count: applicationCount, target: targetName });
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
  t: EditorTranslator,
): { options: Array<{ value: number; label: string }>; defaultValue: number } {
  const active = activeStagesOf(stages);
  const range = insertionRange(active, kind);
  const options: Array<{ value: number; label: string }> = [];
  for (let index = range.min; index <= range.max; index += 1) {
    const before = active[index];
    options.push({
      value: index,
      label: before ? t("beforeStage", { name: before.name }) : t("atTheEnd"),
    });
  }
  return { options, defaultValue: range.defaultIndex };
}

/** Screen-reader sentence for a successful reorder. */
export function reorderAnnouncement(
  stages: readonly EditorStage[],
  stageId: string,
  ids: readonly string[],
  t: EditorTranslator,
): string {
  const stage = stages.find((candidate) => candidate.id === stageId);
  const position = ids.indexOf(stageId) + 1;
  return t("reorderAnnouncement", {
    name: stage?.name ?? t("stageFallback"),
    position,
    total: ids.length,
  });
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
