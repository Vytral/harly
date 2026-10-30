import {
  applicationStatusForStageKind,
  effectiveStageKind,
  isTerminalStageKind,
  STAGE_KIND_LABELS,
  type ApplicationOutcome,
  type StageKind,
} from "@harly/db/stage-kind";

/**
 * Visual meaning of pipeline stages. Everything here is driven by the stage
 * kind (or the application outcome), never by the display name. Names are
 * shown as text; they never decide a colour, a position or a terminal state.
 *
 * Client-safe: imports only the kind module, not the database client.
 */

export type StageTone = "neutral" | "progress" | "success" | "danger" | "quiet";

export type StageSource = {
  id?: string;
  name: string;
  kind?: StageKind | null;
};

/** The kind a stage row means, tolerating rows with a NULL kind. */
export function kindOf(stage: StageSource): StageKind {
  return effectiveStageKind({ kind: stage.kind ?? null, name: stage.name });
}

export function isTerminalStage(stage: StageSource) {
  return isTerminalStageKind(kindOf(stage));
}

/** The name a person sees. Falls back to the kind label if the name is blank. */
export function stageDisplayName(stage: StageSource) {
  const trimmed = stage.name.trim();
  return trimmed || STAGE_KIND_LABELS[kindOf(stage)];
}

export function stageTone(kind: StageKind): StageTone {
  switch (kind) {
    case "hired":
      return "success";
    case "rejected":
      return "danger";
    case "withdrawn":
      return "quiet";
    case "offer":
      return "progress";
    default:
      return "neutral";
  }
}

export const OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  active: "Active",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function outcomeLabel(outcome: ApplicationOutcome) {
  return OUTCOME_LABELS[outcome];
}

export function isApplicationOutcome(value: unknown): value is ApplicationOutcome {
  return typeof value === "string" && Object.hasOwn(OUTCOME_LABELS, value);
}

export function outcomeTone(outcome: ApplicationOutcome): StageTone {
  return outcome === "active" ? "neutral" : stageTone(outcome);
}

/**
 * Candidate-facing label for an application outcome. "Offer" is not used for
 * hired: a hire is a hire, and an offer is a stage a candidate may or may not be
 * in.
 */
export const PORTAL_OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  active: "In progress",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

/** Outcome an application holds while sitting in a stage of this kind. */
export function outcomeForStage(stage: StageSource): ApplicationOutcome {
  return applicationStatusForStageKind(kindOf(stage));
}

// ── Spine ───────────────────────────────────────────────────────────────────

export type SpineSegmentState =
  | "done"
  | "current"
  | "todo"
  | "hired"
  | "rejected"
  | "withdrawn";

export type SpineSegment = {
  key: string;
  name: string;
  state: SpineSegmentState;
  isCurrent: boolean;
};

export type SpineModel = {
  /** Terminal outcome of the current stage, or null while in progress. */
  terminal: "hired" | "rejected" | "withdrawn" | null;
  label: string;
  /** 1-based position in the spine, or 0 when the current stage is not on it. */
  position: number;
  total: number;
  segments: SpineSegment[];
};

/**
 * Build the spine for a pipeline. The current stage is located by id when one
 * is given, otherwise by display name (matching the caller's own display), and
 * finally by kind, so a custom stage that is not on the spine still gets a
 * sensible position.
 */
export function buildSpine(input: {
  current: StageSource;
  currentId?: string | null;
  stages: readonly StageSource[];
}): SpineModel {
  const currentKind = kindOf(input.current);
  const terminal = isTerminalStageKind(currentKind)
    ? (currentKind as "hired" | "rejected" | "withdrawn")
    : null;

  let activeIndex = -1;
  if (input.currentId) {
    activeIndex = input.stages.findIndex((stage) => stage.id === input.currentId);
  }
  if (activeIndex < 0) {
    const wanted = input.current.name.trim().toLowerCase();
    activeIndex = input.stages.findIndex(
      (stage) => stage.name.trim().toLowerCase() === wanted,
    );
  }
  if (activeIndex < 0 && terminal === null) {
    activeIndex = input.stages.findIndex((stage) => kindOf(stage) === currentKind);
  }

  const segments: SpineSegment[] = input.stages.map((stage, index) => {
    const key = stage.id ?? `${index}:${stage.name}`;
    const name = stageDisplayName(stage);
    if (terminal) {
      return { key, name, state: terminal, isCurrent: false };
    }
    if (activeIndex < 0) {
      return { key, name, state: "todo", isCurrent: false };
    }
    if (index === activeIndex) {
      return { key, name, state: "current", isCurrent: true };
    }
    return {
      key,
      name,
      state: index < activeIndex ? "done" : "todo",
      isCurrent: false,
    };
  });

  const label =
    terminal !== null ? outcomeLabel(terminal) : stageDisplayName(input.current);

  return {
    terminal,
    label,
    position: activeIndex >= 0 ? activeIndex + 1 : 0,
    total: input.stages.length,
    segments,
  };
}
