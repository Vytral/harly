"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";

import type { StageKind } from "@harly/db/stage-kind";

import {
  archiveJobStageAction,
  createJobStageAction,
  deleteJobStageAction,
  listJobStagesAction,
  reorderJobStagesAction,
  updateJobStageAction,
} from "@/features/pipeline/stage-actions";

import {
  reorderAnnouncement,
  sameStageState,
  toEditorStage,
  type EditorStage,
} from "./model";
import {
  editorReducer,
  initialEditorState,
  type PendingOperation,
} from "./reducer";

/**
 * Client controller for the stage editor. It owns the optimistic reorder, the
 * rollback when the server refuses, and the reload when the pipeline changed
 * under the user. Rules live in `model.ts` and the server; this only sequences
 * calls.
 *
 * The server actions return `{ success: false, error }` without a status code,
 * so a concurrent change is detected by comparing the server state the editor
 * last saw with a fresh read after any failure.
 */

const LOAD_FAILED = "The stages could not be loaded. Try again.";
const SAVE_FAILED = "The pipeline could not be updated. Try again.";
const REORDER_FAILED_TOAST = "Stage order was not saved. The previous order is back.";

type Outcome = { success: true } | { success: false; error: string };

async function fetchStages(jobId: string): Promise<EditorStage[] | null> {
  try {
    const result = await listJobStagesAction({ jobId, includeArchived: true });
    return result.success ? result.stages.map(toEditorStage) : null;
  } catch {
    return null;
  }
}

export function useStageEditor({
  jobId,
  onMutated,
}: {
  jobId: string;
  /** Called after a mutation is saved, so the surrounding page can refresh. */
  onMutated?: () => void;
}) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  // Refs read by async callbacks: the latest stages (for announcements), the
  // last server state (for conflict detection) and a guard against overlapping
  // mutations, which the server would serialize anyway.
  const stagesRef = useRef<EditorStage[]>(state.stages);
  const syncedRef = useRef<EditorStage[] | null>(null);
  const busyRef = useRef(false);
  const onMutatedRef = useRef(onMutated);

  useEffect(() => {
    stagesRef.current = state.stages;
  }, [state.stages]);

  useEffect(() => {
    onMutatedRef.current = onMutated;
  }, [onMutated]);

  const load = useCallback(async () => {
    dispatch({ type: "load_started" });
    const stages = await fetchStages(jobId);
    if (!stages) {
      dispatch({ type: "load_failed", message: LOAD_FAILED });
      return;
    }
    syncedRef.current = stages;
    dispatch({ type: "loaded", stages });
  }, [jobId]);

  /**
   * Run one mutation. Busy-guarded, with an optional optimistic step applied
   * after the guard. The pending state stays until the fresh list is in, so
   * controls remain disabled while the editor is still catching up.
   */
  const runOperation = useCallback(
    async (input: {
      pending: PendingOperation;
      optimistic?: () => void;
      work: () => Promise<Outcome>;
      announcement?: string;
      failureToast?: string;
    }): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      dispatch({ type: "operation_started", pending: input.pending });
      input.optimistic?.();
      try {
        let result: Outcome;
        try {
          result = await input.work();
        } catch {
          result = { success: false, error: SAVE_FAILED };
        }

        if (result.success) {
          await load();
          dispatch({ type: "operation_succeeded", announcement: input.announcement });
          onMutatedRef.current?.();
          return true;
        }

        const before = syncedRef.current;
        const fresh = await fetchStages(jobId);
        if (fresh) {
          syncedRef.current = fresh;
          if (before && !sameStageState(before, fresh)) {
            dispatch({ type: "conflict", stages: fresh, detail: result.error });
            return false;
          }
        }
        dispatch({ type: "operation_failed", message: result.error });
        if (input.failureToast) toast.error(input.failureToast);
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [jobId, load],
  );

  const reorder = useCallback(
    (stageId: string, ids: string[]) =>
      runOperation({
        pending: { kind: "reorder" },
        optimistic: () => {
          dispatch({ type: "reorder_previewed", ids });
          dispatch({
            type: "announced",
            text: reorderAnnouncement(stagesRef.current, stageId, ids),
          });
        },
        work: () => reorderJobStagesAction({ jobId, stageIds: ids }),
        failureToast: REORDER_FAILED_TOAST,
      }),
    [jobId, runOperation],
  );

  const rename = useCallback(
    (stageId: string, name: string) =>
      runOperation({
        pending: { kind: "save", stageId },
        work: () => updateJobStageAction({ jobId, stageId, name }),
      }),
    [jobId, runOperation],
  );

  const recolor = useCallback(
    (stageId: string, color: string | null) =>
      runOperation({
        pending: { kind: "save", stageId },
        work: () => updateJobStageAction({ jobId, stageId, color }),
      }),
    [jobId, runOperation],
  );

  const changeKind = useCallback(
    (stageId: string, kind: StageKind) =>
      runOperation({
        pending: { kind: "save", stageId },
        work: () => updateJobStageAction({ jobId, stageId, kind }),
      }),
    [jobId, runOperation],
  );

  const setEmailEnabled = useCallback(
    (stageId: string, enabled: boolean) =>
      runOperation({
        pending: { kind: "save", stageId },
        work: () =>
          updateJobStageAction({
            jobId,
            stageId,
            emailConfig: { candidateUpdatesEnabled: enabled },
          }),
      }),
    [jobId, runOperation],
  );

  const create = useCallback(
    (input: { name: string; kind: StageKind; position: number }) =>
      runOperation({
        pending: { kind: "create" },
        work: () => createJobStageAction({ jobId, ...input }),
        announcement: `Added ${input.name}.`,
      }),
    [jobId, runOperation],
  );

  const archive = useCallback(
    (stageId: string, mergeIntoStageId: string | null) =>
      runOperation({
        pending: { kind: "archive", stageId },
        work: () => archiveJobStageAction({ jobId, stageId, mergeIntoStageId }),
      }),
    [jobId, runOperation],
  );

  const remove = useCallback(
    (stageId: string) =>
      runOperation({
        pending: { kind: "delete", stageId },
        work: () => deleteJobStageAction({ jobId, stageId }),
      }),
    [jobId, runOperation],
  );

  const dismissNotice = useCallback(() => dispatch({ type: "notice_dismissed" }), []);
  const announce = useCallback((text: string) => dispatch({ type: "announced", text }), []);

  return {
    state,
    busy: state.pending !== null,
    load,
    announce,
    reorder,
    rename,
    recolor,
    changeKind,
    setEmailEnabled,
    create,
    archive,
    remove,
    dismissNotice,
  };
}
