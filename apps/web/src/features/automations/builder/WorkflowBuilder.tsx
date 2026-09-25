"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";

import { cn } from "@/lib/utils";
import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { FocusModeTopBar } from "@/components/focus-mode/FocusModeTopBar";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import Image from "next/image";
import {
  ArrowLeft,
  Clock,
  FlaskConical,
  X,
  Zap,
} from "lucide-react";
import { HarlyAIPanel, type AutomationContext } from "@/components/dashboard/HarlyAIPanel";
import { semanticGraphHash } from "../definition/hash";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  createWorkflowAction,
  dryRunWorkflowAction,
  getWorkflowAction,
  getWorkflowMetricsAction,
  listWorkflowVersionsAction,
  pauseWorkflowAction,
  publishWorkflowAction,
  approveWorkflowAction,
  requestWorkflowApprovalAction,
  resumeWorkflowAction,
  rollbackWorkflowAction,
  previewWorkflowPayloadAction,
  updateWorkflowAction,
} from "../actions";
import type { SerializedWorkflow } from "./types";
import type { WorkflowDefinitionInput, WorkflowEvent } from "../schema";

import { DryRunPanel } from "./DryRunPanel";
import { RunsTimeline } from "./RunsTimeline";
import { triggerMeta } from "./catalog";
import type { WorkflowValidationIssue } from "../publish-validation";
import { EditorWorkspace } from "./canvas/EditorWorkspace";
import { editorReducer, initialEditorState } from "./state/editor-reducer";
import { ConflictDialog } from "./ConflictDialog";
import { SaveStatus } from "./SaveStatus";
import { graphToLegacy } from "../definition/legacy-adapter";
import {
  diffGraphSummaries,
  summarizeGraph,
  type GraphDiffLine,
} from "./graph-diff";
import {
  AUTOSAVE_DELAY_MS,
  beginSave,
  initialSaveState,
  isDirty,
  markDirty,
  saveConflict,
  saveFailed,
  saveSucceededNow,
  setOnline,
  type SaveState,
} from "./save-controller";
import type { EditorLayout, WorkflowGraphV2 } from "../definition/schema-v2";
import type { WorkflowDocumentTemplateSnapshot } from "@/features/document-templates/shared";
import type { SafeAutomationToolManifest } from "./catalog";

export type WorkflowDraft = WorkflowDefinitionInput & {
  id?: string;
  draftRevision?: number;
  contentHash?: string;
};

export type BuilderDataProps = {
  toolManifests: SafeAutomationToolManifest[];
  members: { id: string; name: string; email?: string }[];
  stageNames: string[];
  stages?: { id: string; name: string; jobId: string }[];
  jobs: { id: string; title: string }[];
  emailTemplates: { id: string; name: string; subject: string; type: string }[];
  documentTemplates: WorkflowDocumentTemplateSnapshot[];
  documents: { id: string; name: string; mimeType: string }[];
  attachmentDocuments: {
    id: string;
    name: string;
    mimeType: string;
    checksum: string;
  }[];
  interviews: { id: string; label: string; hint?: string }[];
  tags: string[];
  webhookEndpoints: {
    id: string;
    name: string;
    enabled: boolean;
    lastReceivedAt: string | null;
    payloadSchema: Record<string, unknown>;
  }[];
  defaultTimeZone: string;
  candidates: { id: string; name: string; email: string }[];
  /** The authenticated user's real display name, used by Harly AI greeting. */
  userName: string;
};

function newBuilderChatKey(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `builder:new:${id}`;
}

function toDraft(w: SerializedWorkflow): WorkflowDraft {
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? undefined,
    enabled: w.enabled,
    trigger: w.trigger,
    conditions: w.conditions,
    actions: w.actions,
    maxRunsPerMinute: w.maxRunsPerMinute,
    maxExternalActionsPerMinute: w.maxExternalActionsPerMinute,
    circuitBreakerThreshold: w.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: w.circuitBreakerCooldownSeconds,
    draftRevision: w.draftRevision,
    contentHash: w.contentHash,
  };
}

export function WorkflowBuilder({
  initial,
  builderData,
  isNew = false,
}: {
  initial: SerializedWorkflow | null;
  builderData: BuilderDataProps;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState<WorkflowDraft>(() =>
    initial
      ? toDraft(initial)
      : {
          name: "",
          enabled: true,
          trigger: { event: "application.created" as WorkflowEvent },
          conditions: [],
          actions: [],
          maxRunsPerMinute: 60,
          maxExternalActionsPerMinute: 30,
          circuitBreakerThreshold: 5,
          circuitBreakerCooldownSeconds: 300,
        },
  );
  const hasChosenTrigger = true;
  const [save, setSave] = useState<SaveState>(() => initialSaveState(true, isNew));
  const [status, setStatus] = useState<SerializedWorkflow["status"]>(
    initial?.status ?? "draft",
  );
  const [approved, setApproved] = useState(Boolean(initial?.approvedAt));
  const [approvalRequested, setApprovalRequested] = useState(
    Boolean(initial?.approvalRequestedAt),
  );
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    Boolean(initial?.hasUnpublishedChanges),
  );
  const [saving, startSave] = useTransition();
  const [tab, setTab] = useState<"build" | "test" | "runs">("build");
  const [sampleScenario, setSampleScenario] = useState("success");
  const [publishIssues, setPublishIssues] = useState<WorkflowValidationIssue[]>(
    [],
  );
  const [editorState, editorDispatch] = useReducer(
    editorReducer,
    undefined,
    () => initialEditorState(initial?.graph, initial?.layout),
  );
  const canvas = useMemo(
    () => ({ graph: editorState.graph, layout: editorState.layout }),
    [editorState.graph, editorState.layout],
  );
  const [conflictOpen, setConflictOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // A new, unsaved automation has no durable id yet. Keep its chat isolated
  // for this editor session instead of restoring another new draft's history.
  const [newDraftChatKey] = useState(newBuilderChatKey);
  const [serverGraph, setServerGraph] = useState<WorkflowGraphV2 | null>(null);
  const [diffLines, setDiffLines] = useState<GraphDiffLine[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const selectedNodeId = editorState.selection.nodeIds[0];
  const dirty = isDirty(save);
  const { confirmDiscard, discardDialogProps } = useUnsavedChangesGuard(dirty);
  const saveFnRef = useRef<(() => Promise<boolean>) | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const draftRef = useRef(draft);
  const canvasRef = useRef(canvas);
  const saveRef = useRef(save);

  useEffect(() => {
    canvasRef.current = {
      graph: editorState.graph,
      layout: editorState.layout,
    };
  }, [editorState.graph, editorState.layout]);

  const commitSave = useCallback((next: SaveState) => {
    saveRef.current = next;
    setSave(next);
  }, []);

  const noteDirty = useCallback(() => {
    commitSave(markDirty(saveRef.current));
  }, [commitSave]);

  const prevPastLengthRef = useRef(editorState.past.length);
  useEffect(() => {
    if (editorState.past.length !== prevPastLengthRef.current) {
      prevPastLengthRef.current = editorState.past.length;
      noteDirty();
    }
  }, [editorState.past.length, noteDirty]);

  const update = useCallback(
    (producer: (d: WorkflowDraft) => void) => {
      const next = structuredClone(draftRef.current);
      producer(next);
      draftRef.current = next;
      setDraft(next);
      noteDirty();
    },
    [noteDirty],
  );

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    window.location.href = "/dashboard/automations";
  }

  function recipePayload(
    currentDraft: WorkflowDraft,
    graph: WorkflowGraphV2,
  ): WorkflowDefinitionInput {
    const legacy = graphToLegacy(graph);
    return {
      name: currentDraft.name.trim(),
      description: currentDraft.description,
      enabled: currentDraft.enabled,
      trigger: legacy.trigger,
      conditions: legacy.conditions,
      actions: legacy.actions.map((action) => ({
        ...action,
        continueOnError: action.continueOnError ?? false,
      })),
      maxRunsPerMinute: currentDraft.maxRunsPerMinute,
      maxExternalActionsPerMinute: currentDraft.maxExternalActionsPerMinute,
      circuitBreakerThreshold: currentDraft.circuitBreakerThreshold,
      circuitBreakerCooldownSeconds: currentDraft.circuitBreakerCooldownSeconds,
    };
  }

  const handleAutomationApplied = useCallback(
    async ({ workflowId }: { workflowId: string; draftRevision?: number }) => {
      const currentId = draftRef.current.id;
      // Applying a proposal to a new automation creates a durable draft. Its
      // canonical route is the only safe source of all server fields, so move
      // directly there rather than leaving the old blank canvas on screen.
      if (!currentId || currentId !== workflowId) {
        window.location.assign(`/dashboard/automations/${workflowId}`);
        return;
      }

      const result = await getWorkflowAction(workflowId);
      if (!result.ok || !result.workflow?.graph || !result.workflow.layout) {
        toast.error(
          result.error ?? "The automation was applied, but the updated draft could not be loaded.",
        );
        return;
      }

      const nextDraft = toDraft(result.workflow);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      editorDispatch({
        type: "hydrate",
        graph: result.workflow.graph,
        layout: result.workflow.layout,
      });
      setStatus(result.workflow.status);
      setApproved(Boolean(result.workflow.approvedAt));
      setApprovalRequested(Boolean(result.workflow.approvalRequestedAt));
      setHasUnpublishedChanges(Boolean(result.workflow.hasUnpublishedChanges));
      setPublishIssues([]);
      commitSave(initialSaveState(navigator.onLine, false));
      toast.success("Automation updated in the builder.");
    },
    [commitSave],
  );

  async function performSave(): Promise<boolean> {
    if (saveRef.current.inFlightGeneration !== null && savePromiseRef.current) {
      return savePromiseRef.current;
    }
    const started = beginSave(saveRef.current);
    commitSave(started.state);
    if (started.skip || started.generation == null) {
      return !isDirty(started.state) && started.state.kind === "saved";
    }
    const operation = performSaveGeneration(started.generation);
    savePromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      if (savePromiseRef.current === operation) savePromiseRef.current = null;
    }
  }

  async function performSaveGeneration(generation: number): Promise<boolean> {
    const currentDraft = draftRef.current;
    const currentCanvas = canvasRef.current;
    const payload = recipePayload(currentDraft, currentCanvas.graph);
    const extras = { graph: currentCanvas.graph, layout: currentCanvas.layout };
    try {
      const result = currentDraft.id
        ? await updateWorkflowAction(
            currentDraft.id,
            payload,
            currentDraft.draftRevision,
            extras,
          )
        : await createWorkflowAction(payload, extras);
      if (result.ok && result.workflow) {
        setPublishIssues([]);
        setStatus(result.workflow.status);
        setApproved(Boolean(result.workflow.approvedAt));
        setApprovalRequested(Boolean(result.workflow.approvalRequestedAt));
        setHasUnpublishedChanges(
          Boolean(result.workflow.hasUnpublishedChanges),
        );
        const savedDraft = {
          ...draftRef.current,
          id: result.workflow!.id,
          name: result.workflow!.name,
          draftRevision: result.workflow!.draftRevision,
          contentHash: result.workflow!.contentHash,
        };
        draftRef.current = savedDraft;
        setDraft(savedDraft);
        const next = saveSucceededNow(saveRef.current, generation);
        commitSave(next);
        if (next.queued) return performSave();
        return !isDirty(saveRef.current) && saveRef.current.kind === "saved";
      }
      if (result.conflict) {
        setConflictOpen(true);
        setServerGraph(result.workflow?.graph ?? null);
        setDiffLines(
          result.workflow?.graph
            ? diffGraphSummaries(
                summarizeGraph(currentCanvas.graph),
                summarizeGraph(result.workflow.graph),
              )
            : null,
        );
        commitSave(
          saveConflict(
            saveRef.current,
            generation,
            result.error ?? "This draft was saved elsewhere.",
            result.workflow?.draftRevision ?? null,
          ),
        );
        toast.error(result.error ?? "This draft was saved elsewhere.");
        return false;
      }
      commitSave(
        saveFailed(
          saveRef.current,
          generation,
          result.error ?? "Could not save.",
        ),
      );
      toast.error(result.error ?? "Could not save.");
      return false;
    } catch (error) {
      const aborted =
        error instanceof DOMException && error.name === "AbortError";
      commitSave(
        saveFailed(
          saveRef.current,
          generation,
          error instanceof Error ? error.message : "Could not save.",
          aborted,
        ),
      );
      if (currentDraft.id) {
        const latest = await getWorkflowAction(currentDraft.id);
        if (latest.ok && latest.workflow) {
          if (latest.workflow.draftRevision !== currentDraft.draftRevision) {
            setConflictOpen(true);
            setServerGraph(latest.workflow.graph ?? null);
            commitSave(
              saveConflict(
                saveRef.current,
                generation,
                "The server may already have a newer revision. Compare before retrying.",
                latest.workflow.draftRevision,
              ),
            );
          } else {
            const current = {
              ...draftRef.current,
              draftRevision: latest.workflow.draftRevision,
            };
            draftRef.current = current;
            setDraft(current);
          }
        }
      }
      toast.error("Could not save.");
      return false;
    }
  }

  async function flushPendingSave(): Promise<boolean> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = saveRef.current;
      if (
        !current.online ||
        current.kind === "conflict" ||
        current.kind === "error"
      ) {
        return false;
      }
      if (current.inFlightGeneration !== null) {
        const inFlight = savePromiseRef.current;
        if (!inFlight || !(await inFlight)) return false;
        continue;
      }
      if (!isDirty(current)) return current.kind === "saved";
      if (!(await performSave())) return false;
    }
    return false;
  }

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);
  useEffect(() => {
    saveFnRef.current = () => {
      return performSave();
    };
  });

  useEffect(() => {
    function onOnline() {
      commitSave(setOnline(saveRef.current, navigator.onLine));
    }
    onOnline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, [commitSave]);

  useEffect(() => {
    if (!draft.id) return;
    if (
      !isDirty(save) ||
      save.kind === "conflict" ||
      save.kind === "saving" ||
      !save.online
    )
      return;
    const timer = window.setTimeout(() => {
      void saveFnRef.current?.();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Autosave is keyed off the dirty generation, not the save function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.dirtyGeneration, save.kind, save.online, draft.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFnRef.current?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function runGovernanceAction(
    action: (
      id: string,
      revision: number,
    ) => Promise<{
      ok: boolean;
      error?: string;
      issues?: WorkflowValidationIssue[];
      conflict?: boolean;
    }>,
    success: string,
    nextStatus: SerializedWorkflow["status"],
    nextApproved = approved,
    nextApprovalRequested = approvalRequested,
  ) {
    startSave(async () => {
      if (!(await flushPendingSave())) {
        toast.error(
          "Save the latest draft before changing its approval or publish status.",
        );
        return;
      }
      const currentDraft = draftRef.current;
      if (!currentDraft.id || currentDraft.draftRevision === undefined) {
        toast.error(
          "Save the recipe before changing its approval or publish status.",
        );
        return;
      }
      const result = await action(currentDraft.id, currentDraft.draftRevision);
      if (!result.ok) {
        const issues = result.issues ?? [];
        setPublishIssues(issues);
        if (issues.length > 0) setTab("build");
        if (result.conflict) {
          const latest = await getWorkflowAction(currentDraft.id);
          if (latest.ok && latest.workflow) {
            setServerGraph(latest.workflow.graph ?? null);
            setDiffLines(
              latest.workflow.graph
                ? diffGraphSummaries(
                    summarizeGraph(canvasRef.current.graph),
                    summarizeGraph(latest.workflow.graph),
                  )
                : null,
            );
            commitSave(
              saveConflict(
                saveRef.current,
                saveRef.current.dirtyGeneration,
                result.error ?? "This draft changed elsewhere.",
                latest.workflow.draftRevision,
              ),
            );
            setConflictOpen(true);
          }
        }
        toast.error(result.error ?? "Could not update workflow state.");
        return;
      }
      setPublishIssues([]);
      toast.success(success);
      setStatus(nextStatus);
      setApproved(nextApproved);
      setApprovalRequested(nextApprovalRequested);
      if (success === "Workflow published.") setHasUnpublishedChanges(false);
    });
  }

  const meta = triggerMeta(draft.trigger.event);

  return (
    <>
      <FocusModeShell
        topBar={
          <FocusModeTopBar
            className="h-auto min-h-12 flex-wrap py-2 [&>div:first-child]:flex-none [&>div:nth-child(2)]:min-w-0 [&>div:nth-child(2)]:flex-1 [&>div:last-child]:basis-full [&>div:last-child]:flex-wrap xl:[&>div:last-child]:basis-auto"
            left={
              <button
                type="button"
                onClick={handleExit}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-pure-snow/80 py-1.5 pl-2.5 pr-3.5 text-xs font-medium text-foreground shadow-xs transition-all duration-150 hover:bg-soft-kraft active:scale-[0.98]"
              >
                <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
                <span className="hidden sm:inline">Back to automations</span>
              </button>
            }
            center={
              <div className="flex min-w-0 w-full items-center gap-2">
                {hasChosenTrigger ? (
                  <span className="font-display hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-soft-kraft/60 px-3 py-1 text-xs font-semibold text-foreground 2xl:inline-flex">
                    <Zap className="size-3 text-foreground" />
                    {meta.label}
                  </span>
                ) : (
                  <span className="font-display inline-flex items-center rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-soft-ink">
                    New automation
                  </span>
                )}
                <input
                  value={draft.name}
                  onChange={(e) =>
                    update((d) => {
                      d.name = e.target.value;
                    })
                  }
                  placeholder="Untitled automation"
                  className="font-display w-[min(34vw,280px)] truncate rounded-full border border-transparent bg-transparent px-3 py-1 text-sm font-semibold text-foreground outline-none transition-colors duration-150 ease-out placeholder:font-medium placeholder:text-quiet-mist hover:border-border focus:border-foreground/30 focus:bg-soft-kraft/40"
                  aria-label="Automation name"
                />
              </div>
            }
            right={
              <>
                <span
                  className={cn(
                    "font-chrome hidden rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wider sm:inline",
                    status === "published"
                      ? "bg-foreground text-background"
                      : status === "paused"
                        ? "bg-soft-kraft text-soft-ink"
                        : "bg-soft-kraft text-foreground",
                  )}
                >
                  {hasUnpublishedChanges && status !== "draft"
                    ? `${status} · edits`
                    : status}
                </span>
                {draft.id &&
                  (status === "draft" || hasUnpublishedChanges) &&
                  !approvalRequested &&
                  !approved && (
                    <button
                      type="button"
                      onClick={() =>
                        runGovernanceAction(
                          (id, revision) =>
                            requestWorkflowApprovalAction(id, revision),
                          "Approval requested.",
                          status,
                          false,
                          true,
                        )
                      }
                      disabled={saving}
                      className="hidden text-xs font-medium text-soft-ink hover:text-foreground lg:inline"
                    >
                      Request approval
                    </button>
                  )}
                {draft.id &&
                  (status === "draft" || hasUnpublishedChanges) &&
                  approvalRequested &&
                  !approved && (
                    <button
                      type="button"
                      onClick={() =>
                        runGovernanceAction(
                          (id, revision) => approveWorkflowAction(id, revision),
                          "Workflow approved.",
                          status,
                          true,
                          true,
                        )
                      }
                      disabled={saving}
                      className="hidden rounded-lg border border-border bg-soft-kraft px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-soft-kraft/70 active:scale-[0.98] lg:inline"
                    >
                      Approve workflow
                    </button>
                  )}
                {draft.id &&
                  (status === "draft" || hasUnpublishedChanges) &&
                  approved && (
                    <button
                      type="button"
                      onClick={() =>
                        runGovernanceAction(
                          (id, revision) => publishWorkflowAction(id, revision),
                          "Workflow published.",
                          status === "paused" ? "paused" : "published",
                          true,
                          false,
                        )
                      }
                      disabled={saving}
                      className="hidden rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90 active:scale-[0.98] lg:inline"
                    >
                      Publish
                    </button>
                  )}
                {draft.id && status === "published" && (
                  <button
                    type="button"
                    onClick={() =>
                      runGovernanceAction(
                        (id) => pauseWorkflowAction(id),
                        "Workflow paused.",
                        "paused",
                      )
                    }
                    disabled={saving}
                    className="hidden text-xs font-medium text-soft-ink hover:text-danger-rust lg:inline"
                  >
                    Pause
                  </button>
                )}
                {draft.id && status === "paused" && (
                  <button
                    type="button"
                    onClick={() =>
                      runGovernanceAction(
                        (id) => resumeWorkflowAction(id),
                        "Automation turned back on.",
                        "published",
                        true,
                      )
                    }
                    disabled={saving}
                    className="hidden text-xs font-medium text-soft-ink hover:text-foreground lg:inline"
                  >
                    Turn back on
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-soft-ink hover:bg-soft-kraft hover:text-foreground lg:hidden"
                      aria-label="More workflow actions"
                    >
                      More
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {draft.id &&
                    (status === "draft" || hasUnpublishedChanges) &&
                    !approvalRequested &&
                    !approved ? (
                      <DropdownMenuItem
                        onClick={() =>
                          runGovernanceAction(
                            (id, revision) =>
                              requestWorkflowApprovalAction(id, revision),
                            "Approval requested.",
                            status,
                            false,
                            true,
                          )
                        }
                      >
                        Request approval
                      </DropdownMenuItem>
                    ) : null}
                    {draft.id &&
                    (status === "draft" || hasUnpublishedChanges) &&
                    approvalRequested &&
                    !approved ? (
                      <DropdownMenuItem
                        onClick={() =>
                          runGovernanceAction(
                            (id, revision) =>
                              approveWorkflowAction(id, revision),
                            "Workflow approved.",
                            status,
                            true,
                            true,
                          )
                        }
                      >
                        Approve workflow
                      </DropdownMenuItem>
                    ) : null}
                    {draft.id &&
                    (status === "draft" || hasUnpublishedChanges) &&
                    approved ? (
                      <DropdownMenuItem
                        onClick={() =>
                          runGovernanceAction(
                            (id, revision) =>
                              publishWorkflowAction(id, revision),
                            "Workflow published.",
                            status === "paused" ? "paused" : "published",
                            true,
                            false,
                          )
                        }
                      >
                        Publish
                      </DropdownMenuItem>
                    ) : null}
                    {draft.id && status === "published" ? (
                      <DropdownMenuItem
                        onClick={() =>
                          runGovernanceAction(
                            () => pauseWorkflowAction(draft.id!),
                            "Workflow paused.",
                            "paused",
                          )
                        }
                      >
                        Pause
                      </DropdownMenuItem>
                    ) : null}
                    {draft.id && status === "paused" ? (
                      <DropdownMenuItem
                        onClick={() =>
                          runGovernanceAction(
                            () => resumeWorkflowAction(draft.id!),
                            "Automation turned back on.",
                            "published",
                            true,
                          )
                        }
                      >
                        Turn back on
                      </DropdownMenuItem>
                    ) : null}
                    {!draft.id && !hasUnpublishedChanges ? (
                      <DropdownMenuItem disabled>
                        Save the automation to publish it
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-soft-kraft/40 p-0.5">
                  <TabButton
                    active={tab === "build"}
                    onClick={() => setTab("build")}
                  >
                    <Zap className="size-3.5" /> Editor
                  </TabButton>
                  <TabButton
                    active={tab === "test"}
                    onClick={() => setTab("test")}
                  >
                    <FlaskConical className="size-3.5" /> Test
                  </TabButton>
                  {draft.id ? (
                    <TabButton
                      active={tab === "runs"}
                      onClick={() => setTab("runs")}
                    >
                      <Clock className="size-3.5" /> Runs
                    </TabButton>
                  ) : null}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setAiOpen((prev) => !prev)}
                      aria-label={aiOpen ? "Close Harly AI" : "Ask Harly AI"}
                      aria-pressed={aiOpen}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                        aiOpen
                          ? "bg-near-ink text-pure-snow"
                          : "text-near-ink hover:bg-row-wash",
                      )}
                    >
                      {aiOpen ? (
                        <X className="size-[17px]" strokeWidth={2} />
                      ) : (
                        <Image
                          src="/harly-ai-animado.svg"
                          alt="Harly AI"
                          width={22}
                          height={22}
                          className="size-[22px] shrink-0"
                          unoptimized
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{aiOpen ? "Close Harly AI" : "Ask Harly AI"}</TooltipContent>
                </Tooltip>
                <SaveStatus state={save} onSave={() => void performSave()} isNew={!draft.id} />
              </>
            }
          />
        }
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "build" && "hidden")}>
          {publishIssues.length > 0 ? (
            <div className="border-b border-danger-rust/25 bg-danger-rust/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Can’t publish yet
              </p>
              <ul className="mt-1 space-y-1">
                {publishIssues.map((issue) => (
                  <li
                    key={`${issue.nodeId}:${issue.fieldPath}:${issue.message}`}
                    className="text-sm text-danger-rust"
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <EditorWorkspace
            state={editorState}
            dispatch={editorDispatch}
            graph={editorState.graph}
            layout={editorState.layout}
            workflowId={draft.id}
            builderData={builderData}
            onChange={(next) => {
              canvasRef.current = next;
              noteDirty();
            }}
          />
        </div>
        {tab === "test" && (
          <BuilderCanvas>
            <TestView
              draft={draft}
              graph={editorState.graph}
              candidates={builderData.candidates}
              webhookEndpoints={builderData.webhookEndpoints}
              onScenarioChange={setSampleScenario}
            />
          </BuilderCanvas>
        )}
        {tab === "runs" && draft.id && (
          <BuilderCanvas>
            <RunsView workflowId={draft.id} members={builderData.members} />
          </BuilderCanvas>
        )}
      </FocusModeShell>
      {draft.id && (
        <VersionHistory
          workflowId={draft.id}
          currentVersion={initial?.definitionVersion ?? 1}
          draft={draft}
        />
      )}
      <ConflictDialog
        open={conflictOpen}
        localGraph={canvas.graph}
        serverGraph={serverGraph}
        message={save.conflictMessage ?? "This draft was saved elsewhere."}
        comparing={comparing}
        lines={diffLines}
        onDismiss={() => setConflictOpen(false)}
        onCompare={() => {
          setComparing(true);
          void (async () => {
            if (!draft.id) {
              setComparing(false);
              return;
            }
            const latest = await getWorkflowAction(draft.id);
            const graph = latest.workflow?.graph ?? null;
            setServerGraph(graph);
            setDiffLines(
              graph
                ? diffGraphSummaries(
                    summarizeGraph(canvas.graph),
                    summarizeGraph(graph),
                  )
                : [
                    {
                      id: "missing",
                      message: "Could not load the server copy to compare.",
                    },
                  ],
            );
            setComparing(false);
          })();
        }}
        onCopy={() => {
          startSave(async () => {
            const payload = recipePayload(draft, canvas.graph);
            const result = await createWorkflowAction(
              {
                ...payload,
                name: `${payload.name || "Untitled recipe"} (copy)`,
              },
              { graph: canvas.graph, layout: canvas.layout },
            );
            if (result.ok && result.workflow) {
              toast.success("Copied your edits into a new recipe.");
              window.location.assign(
                `/dashboard/automations/${result.workflow.id}`,
              );
            } else {
              toast.error(result.error ?? "Could not copy this draft.");
            }
          });
        }}
      />
      <UnsavedChangesDialog
        open={discardDialogProps.open}
        onConfirm={discardDialogProps.onConfirm}
        onCancel={discardDialogProps.onCancel}
      />
      {aiOpen && (
        <HarlyAIPanel
          userName={builderData.userName}
          persistenceKey={draft.id ? `builder:${draft.id}` : newDraftChatKey}
          aiEnabled={true}
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          automationContext={buildAutomationContext({
            draft,
            canvasGraph: canvas.graph,
            canvasLayout: canvas.layout,
            selectedNodeId,
            unsaved: isDirty(save),
            serverContentHash: draft.contentHash,
            validationIssues: publishIssues,
            activeTab: tab,
            sampleScenario,
          })}
          surfaceContext={{
            kind: "section",
            label: draft.name || "Automation Builder",
            path: draft.id ? `/dashboard/automations/${draft.id}` : "/dashboard/automations/new",
          }}
          onAutomationApplied={handleAutomationApplied}
        />
      )}
    </>
  );
}

// Max size, in bytes of UTF-8 JSON, of the local graph included in
// automationContext. Keeps a chat request's total body comfortably under
// MAX_CHAT_BODY_BYTES (384 KB in route.ts) even though a WorkflowGraphV2 can
// theoretically reach 1 MiB (MAX_GRAPH_BYTES). Real-world drafts are far
// smaller; a draft that happens to exceed this falls back to hash-only
// context rather than risking the whole chat request being rejected.
const MAX_LOCAL_GRAPH_CONTEXT_BYTES = 64_000;

/**
 * Builds the `automationContext` sent to Harly AI (D5). While the draft is
 * clean, the server's own copy is already authoritative, so only revision +
 * hash are sent. While there are unsaved local edits, the actual graph is
 * included (size-capped) so the model reasons about what the user currently
 * sees instead of silently falling back to the last-saved server revision.
 */
function buildAutomationContext(input: {
  draft: {
    id?: string | null;
    draftRevision?: number | null;
    contentHash?: string;
  };
  canvasGraph: WorkflowGraphV2;
  canvasLayout: EditorLayout;
  selectedNodeId?: string;
  unsaved: boolean;
  serverContentHash?: string;
  validationIssues: WorkflowValidationIssue[];
  activeTab: "build" | "test" | "runs";
  sampleScenario: string;
}): AutomationContext {
  const {
    draft,
    canvasGraph,
    canvasLayout,
    selectedNodeId,
    unsaved,
    serverContentHash,
    validationIssues,
    activeTab,
    sampleScenario,
  } = input;
  const localSnapshotHash = semanticGraphHash(canvasGraph);
  let localGraph: Record<string, unknown> | undefined;
  if (unsaved) {
    const serialized = JSON.stringify(canvasGraph);
    if (new TextEncoder().encode(serialized).byteLength <= MAX_LOCAL_GRAPH_CONTEXT_BYTES) {
      localGraph = canvasGraph as unknown as Record<string, unknown>;
    }
  }
  if (!draft.id) {
    return {
      workflowId: null,
      isNew: true,
      isUnsaved: unsaved,
      contentHash: localSnapshotHash,
      localSnapshotHash,
      validationIssues,
      activeTab,
      sampleScenario,
      ...(localGraph ? { graph: localGraph } : {}),
      layout: canvasLayout as unknown as Record<string, unknown>,
    };
  }
  return {
    workflowId: draft.id,
    draftRevision: draft.draftRevision ?? 1,
    contentHash: localSnapshotHash,
    serverContentHash,
    localSnapshotHash,
    selectedNodeId,
    validationIssues,
    activeTab,
    sampleScenario,
    isUnsaved: unsaved,
    ...(localGraph ? { graph: localGraph } : {}),
    layout: canvasLayout as unknown as Record<string, unknown>,
  };
}

function WorkflowMetrics({ workflowId }: { workflowId: string }) {
  const [metrics, setMetrics] = useState<{
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    deadLetters: number;
    retries: number;
    successRate: number;
    averageDurationMs: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void getWorkflowMetricsAction(workflowId).then((result) => {
      if (active && result.ok && result.metrics) setMetrics(result.metrics);
    });
    return () => {
      active = false;
    };
  }, [workflowId]);

  if (!metrics) return null;

  return (
    <section>
      <h2 className="font-display text-sm font-semibold text-foreground">
        Recent activity
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Runs", metrics.total],
          [
            "Succeeded",
            metrics.total === 0 ? "—" : `${Math.round(metrics.successRate * 100)}%`,
          ],
          ["Failed", metrics.failed],
          ["In progress", metrics.running],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-border bg-warm-paper p-3"
          >
            <p className="text-[11px] text-soft-ink">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

type WorkflowVersionRow = {
  id: string;
  version: number;
  name: string;
  triggerEvent: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  createdAt: string;
  publishedAt: string | null;
};

function VersionHistory({
  workflowId,
  currentVersion,
  draft,
}: {
  workflowId: string;
  currentVersion: number;
  draft: WorkflowDraft;
}) {
  const [versions, setVersions] = useState<WorkflowVersionRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void listWorkflowVersionsAction(workflowId).then((result) => {
      if (active && result.ok)
        setVersions((result.versions ?? []) as WorkflowVersionRow[]);
    });
    return () => {
      active = false;
    };
  }, [workflowId]);

  const selectedVersion = versions.find(
    (version) => version.version === selected,
  );
  const differs = selectedVersion
    ? JSON.stringify({
        trigger: draft.trigger,
        conditions: draft.conditions,
        actions: draft.actions,
      }) !==
      JSON.stringify({
        trigger: selectedVersion.trigger,
        conditions: selectedVersion.conditions,
        actions: selectedVersion.actions,
      })
    : false;

  if (versions.length < 2) return null;

  return (
    <section className="mx-auto w-full max-w-3xl border-t border-hairline-c px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">
            Version history
          </h2>
          <p className="mt-1 text-xs text-soft-ink">
            Immutable definitions used for audit and rollback.
          </p>
        </div>
        <span className="text-xs text-soft-ink">Current v{currentVersion}</span>
      </div>
      <div className="mt-4 space-y-2">
        {versions.map((version) => (
          <div
            key={version.id}
            className="rounded-lg border border-border bg-warm-paper p-3"
          >
            <button
              type="button"
              onClick={() =>
                setSelected(
                  selected === version.version ? null : version.version,
                )
              }
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-medium text-foreground">
                v{version.version} · {version.triggerEvent}
              </span>
              <span className="text-xs text-soft-ink">
                {version.publishedAt ? "Published" : "Draft"}
              </span>
            </button>
            {selected === version.version && (
              <div className="mt-3 border-t border-hairline-c pt-3 text-xs text-soft-ink">
                <p>
                  {Array.isArray(version.actions) ? version.actions.length : 0}{" "}
                  actions ·{" "}
                  {Array.isArray(version.conditions)
                    ? version.conditions.length
                    : 0}{" "}
                  conditions · created{" "}
                  {new Date(version.createdAt).toLocaleString()}
                </p>
                <p
                  className={cn(
                    "mt-1 font-medium",
                    differs ? "text-danger-rust" : "text-foreground",
                  )}
                >
                  {differs
                    ? "Differs from current draft"
                    : "Matches current draft"}
                </p>
                {version.version !== currentVersion && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await rollbackWorkflowAction(
                          workflowId,
                          version.version,
                        );
                        if (result.ok) {
                          toast.success(`Restored version ${version.version}.`);
                          window.location.assign(
                            `/dashboard/automations/${workflowId}`,
                          );
                        } else
                          toast.error(result.error ?? "Could not roll back.");
                      });
                    }}
                    className="mt-2 rounded-md border border-border px-2.5 py-1.5 font-medium text-foreground hover:bg-soft-kraft disabled:opacity-50"
                  >
                    Roll back to v{version.version}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "bg-warm-paper text-foreground shadow-xs"
          : "text-soft-ink hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BuilderCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto bg-warm-paper">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </div>
    </div>
  );
}

function RunsView({
  workflowId,
  members,
}: {
  workflowId: string;
  members: Array<{ id: string; name: string; email?: string }>;
}) {
  return (
    <div className="space-y-6">
      <WorkflowMetrics workflowId={workflowId} />
      <section>
        <h2 className="font-display text-sm font-semibold text-foreground">
          Run history
        </h2>
        <p className="mt-1 text-xs text-soft-ink">
          What fired, which action ran, and whether it succeeded. Retry or
          cancel from a row.
        </p>
        <div className="mt-4">
          <RunsTimeline workflowId={workflowId} members={members} />
        </div>
      </section>
    </div>
  );
}

function TestView({
  draft,
  graph,
  candidates,
  webhookEndpoints,
  onScenarioChange,
}: {
  draft: WorkflowDraft;
  graph: WorkflowGraphV2;
  candidates: Array<{ id: string; name: string; email: string }>;
  webhookEndpoints: BuilderDataProps["webhookEndpoints"];
  onScenarioChange?: (scenario: string) => void;
}) {
  const graphTrigger = graph.nodes.find((node) => node.type === "trigger");
  const trigger =
    graphTrigger?.type === "trigger"
      ? { event: graphTrigger.event, filter: graphTrigger.filter }
      : draft.trigger;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-warm-paper p-4 shadow-xs">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Simulate workflow execution
        </h2>
        <p className="mt-1 text-xs text-soft-ink">
          Test your workflow path with sample candidate data. No messages or emails will be sent, and no real candidate data is changed.
        </p>
      </div>
      <DryRunPanel
        trigger={trigger}
        graph={graph}
        candidates={candidates}
        workflowId={draft.id}
        webhookEndpoints={webhookEndpoints}
        preview={previewWorkflowPayloadAction}
        run={dryRunWorkflowAction}
        onScenarioChange={onScenarioChange}
      />
    </div>
  );
}
