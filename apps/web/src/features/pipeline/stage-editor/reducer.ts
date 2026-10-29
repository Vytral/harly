import { activeStagesOf, type EditorStage } from "./model";

/**
 * State for the stage editor. Plain data and pure transitions, so the
 * optimistic reorder, rollback and conflict handling can be tested without a
 * DOM. The hook in `useStageEditor.ts` is the only caller.
 */

export const CONFLICT_MESSAGE = "This pipeline changed. Reloaded.";

export type PendingOperation =
  | { kind: "reorder" }
  | { kind: "save"; stageId: string }
  | { kind: "create" }
  | { kind: "archive"; stageId: string }
  | { kind: "delete"; stageId: string };

export type EditorState = {
  /** The first load has not finished yet. */
  loading: boolean;
  /** At least one load has succeeded, so `stages` is real server data. */
  loaded: boolean;
  stages: EditorStage[];
  loadError: string | null;
  pending: PendingOperation | null;
  /** Inline message for the last failed mutation. Cleared by the next one. */
  notice: string | null;
  /** Polite live-region text (reorders, conflicts). */
  announcement: string;
  /** Server order before an optimistic reorder, restored on failure. */
  snapshot: EditorStage[] | null;
};

export type EditorAction =
  | { type: "load_started" }
  | { type: "loaded"; stages: EditorStage[] }
  | { type: "load_failed"; message: string }
  | { type: "operation_started"; pending: PendingOperation }
  | { type: "reorder_previewed"; ids: string[] }
  | { type: "operation_succeeded"; announcement?: string }
  | { type: "operation_failed"; message: string }
  | { type: "conflict"; stages: EditorStage[]; detail?: string }
  | { type: "notice_dismissed" }
  | { type: "announced"; text: string };

export const initialEditorState: EditorState = {
  loading: false,
  loaded: false,
  stages: [],
  loadError: null,
  pending: null,
  notice: null,
  announcement: "",
  snapshot: null,
};

/** Put the active stages into `ids` order; archived stages keep their place. */
function applyOrder(stages: EditorStage[], ids: readonly string[]): EditorStage[] {
  const position = new Map(ids.map((id, index) => [id, index]));
  return stages.map((stage) => {
    const index = position.get(stage.id);
    if (index === undefined || stage.archivedAt) return stage;
    return { ...stage, order: index };
  });
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load_started":
      return { ...state, loading: true, loadError: null };

    case "loaded":
      return {
        ...state,
        loading: false,
        loaded: true,
        stages: action.stages,
        loadError: null,
      };

    case "load_failed":
      if (!state.loaded) {
        return { ...state, loading: false, loadError: action.message };
      }
      return { ...state, loading: false, notice: action.message };

    case "operation_started":
      return { ...state, pending: action.pending, notice: null };

    case "reorder_previewed":
      return {
        ...state,
        snapshot: state.snapshot ?? state.stages,
        stages: applyOrder(state.stages, action.ids),
      };

    case "operation_succeeded":
      return {
        ...state,
        pending: null,
        snapshot: null,
        announcement: action.announcement ?? state.announcement,
      };

    case "operation_failed":
      return {
        ...state,
        pending: null,
        stages: state.snapshot ?? state.stages,
        snapshot: null,
        notice: action.message,
      };

    case "conflict":
      return {
        ...state,
        pending: null,
        snapshot: null,
        stages: action.stages,
        notice: action.detail ? `${CONFLICT_MESSAGE} ${action.detail}` : CONFLICT_MESSAGE,
        announcement: CONFLICT_MESSAGE,
      };

    case "notice_dismissed":
      return { ...state, notice: null };

    case "announced":
      return { ...state, announcement: action.text };
  }
}

/** Active stages in board order, for components that only render the live list. */
export function selectActive(state: EditorState): EditorStage[] {
  return activeStagesOf(state.stages);
}
