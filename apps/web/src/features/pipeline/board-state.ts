import {
  applicationStatusForStage,
  type ApplicationOutcome,
} from "@harly/db/stage-kind";

import type { PipelineApplication, PipelineStage } from "@/features/pipeline/data";

/**
 * Pure state for the pipeline board: the column layout, the optimistic
 * overlay, and the FIFO of server writes. No React, no server imports, so every
 * rule here is unit tested.
 *
 * Model: the server data (`applications` props) is the base. Every board
 * mutation becomes an operation. Operations are applied on top of the base in
 * the order they were issued, so the visible board is always
 * `base + pending operations`. A failed operation simply stops being applied,
 * which is the rollback; there is no snapshot to restore by hand.
 */

export type BoardColumns = Map<string, PipelineApplication[]>;

export type ApplicationStatus = PipelineApplication["status"];

/** Cards rendered per column before "Show more". */
export const CARD_PAGE_SIZE = 50;

export function buildColumns(
  stages: readonly PipelineStage[],
  applications: readonly PipelineApplication[],
): BoardColumns {
  const columns: BoardColumns = new Map();

  for (const stage of stages) {
    columns.set(stage.id, []);
  }

  for (const application of applications) {
    columns.get(application.currentStageId)?.push(application);
  }

  return columns;
}

export function cloneColumns(columns: BoardColumns): BoardColumns {
  return new Map(
    Array.from(columns.entries()).map(([stageId, applications]) => [
      stageId,
      [...applications],
    ]),
  );
}

export function findApplicationStage(columns: BoardColumns, applicationId: string) {
  for (const [stageId, applications] of columns) {
    const index = applications.findIndex((item) => item.id === applicationId);

    if (index >= 0) {
      return { stageId, application: applications[index], index };
    }
  }

  return null;
}

function removeApplication(columns: BoardColumns, applicationId: string) {
  for (const [stageId, applications] of columns) {
    if (applications.some((application) => application.id === applicationId)) {
      columns.set(
        stageId,
        applications.filter((application) => application.id !== applicationId),
      );
      return;
    }
  }
}

function insertApplication(
  columns: BoardColumns,
  stageId: string,
  application: PipelineApplication,
  index: number,
) {
  const applications = [...(columns.get(stageId) ?? [])];
  const boundedIndex = Math.max(0, Math.min(index, applications.length));
  applications.splice(boundedIndex, 0, application);
  columns.set(stageId, applications);
}

/** The stage a pointer or keyboard drop lands in, and the index it lands at. */
export function getOverTarget(
  columns: BoardColumns,
  stages: readonly PipelineStage[],
  overId: string,
) {
  const stage = stages.find((item) => item.id === overId);

  if (stage) {
    return {
      stageId: stage.id,
      index: columns.get(stage.id)?.length ?? 0,
    };
  }

  const application = findApplicationStage(columns, overId);

  if (application) {
    return {
      stageId: application.stageId,
      index: application.index,
    };
  }

  return null;
}

export function matchesSearch(application: PipelineApplication, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = [
    application.candidateFirstName,
    application.candidateLastName,
    application.candidateEmail,
    application.jobTitle,
    application.source ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

// ── Operations ──────────────────────────────────────────────────────────────

type OperationBase = {
  /** Unique per operation; used to find it in the queue. */
  id: string;
  workspaceId: string;
  /** Short human label for toasts and announcements, e.g. "Ada Lovelace". */
  subject: string;
  /** ISO timestamp the change was issued, used for the stage age on the card. */
  issuedAt: string;
};

export type MoveOperation = OperationBase & {
  kind: "move";
  applicationId: string;
  fromStageId: string;
  toStageId: string;
  toStageName: string;
  /** Final index in the target column, after the source card is removed. */
  index: number;
  /** Status the application holds once it sits in the target stage. */
  outcome: ApplicationOutcome;
  /** Target column order after the move, as sent to the server. */
  orderedApplicationIds: string[];
  /** Whether the drag was started from the keyboard (focus is restored). */
  keyboard: boolean;
};

export type StatusOperation = OperationBase & {
  kind: "status";
  applicationIds: string[];
  status: ApplicationStatus;
};

export type BulkMoveOperation = OperationBase & {
  kind: "bulkMove";
  applicationIds: string[];
  toStageId: string;
  toStageName: string;
  outcome: ApplicationOutcome;
};

export type BoardOperation = MoveOperation | StatusOperation | BulkMoveOperation;

export function operationApplicationIds(operation: BoardOperation): string[] {
  return operation.kind === "move"
    ? [operation.applicationId]
    : operation.applicationIds;
}

/**
 * Apply one operation to a column layout, returning a new layout. Stage
 * outcome (status) follows the stage the application lands in, so a card moved
 * into a hired stage reads as hired right away.
 */
export function applyOperation(columns: BoardColumns, operation: BoardOperation): BoardColumns {
  const next = cloneColumns(columns);

  if (operation.kind === "move") {
    const found = findApplicationStage(next, operation.applicationId);
    if (!found) return next;

    removeApplication(next, operation.applicationId);
    insertApplication(
      next,
      operation.toStageId,
      {
        ...found.application,
        currentStageId: operation.toStageId,
        status: operation.outcome,
        lastStageMovedAt:
          found.stageId === operation.toStageId
            ? found.application.lastStageMovedAt
            : operation.issuedAt,
      },
      operation.index,
    );
    return next;
  }

  if (operation.kind === "status") {
    const ids = new Set(operation.applicationIds);
    for (const [stageId, applications] of next) {
      next.set(
        stageId,
        applications.map((application) =>
          ids.has(application.id)
            ? { ...application, status: operation.status }
            : application,
        ),
      );
    }
    return next;
  }

  for (const applicationId of operation.applicationIds) {
    const found = findApplicationStage(next, applicationId);
    if (!found) continue;

    removeApplication(next, applicationId);
    insertApplication(
      next,
      operation.toStageId,
      {
        ...found.application,
        currentStageId: operation.toStageId,
        status: operation.outcome,
        lastStageMovedAt:
          found.stageId === operation.toStageId
            ? found.application.lastStageMovedAt
            : operation.issuedAt,
      },
      next.get(operation.toStageId)?.length ?? 0,
    );
  }
  return next;
}

/**
 * Work out the operation for a drop. Returns null when the drop does not change
 * anything (dropped back onto its own position), so no server write is made.
 */
export function planDropOperation(input: {
  id: string;
  columns: BoardColumns;
  stages: readonly PipelineStage[];
  applicationId: string;
  overId: string;
  issuedAt: string;
  keyboard: boolean;
}): MoveOperation | null {
  const { columns, stages } = input;
  const current = findApplicationStage(columns, input.applicationId);
  const target = getOverTarget(columns, stages, input.overId);

  if (!current || !target) return null;

  const sameStage = current.stageId === target.stageId;
  const index =
    sameStage && target.index > current.index ? target.index - 1 : target.index;

  if (sameStage && index === current.index) return null;

  const toStage = stages.find((stage) => stage.id === target.stageId);
  if (!toStage) return null;

  const operation: Omit<MoveOperation, "orderedApplicationIds"> = {
    kind: "move",
    id: input.id,
    workspaceId: current.application.workspaceId,
    subject: displayName(current.application),
    issuedAt: input.issuedAt,
    applicationId: input.applicationId,
    fromStageId: current.stageId,
    toStageId: target.stageId,
    toStageName: toStage.name,
    index,
    outcome: applicationStatusForStage(toStage),
    keyboard: input.keyboard,
  };

  const after = applyOperation(columns, { ...operation, orderedApplicationIds: [] });

  return {
    ...operation,
    orderedApplicationIds: (after.get(target.stageId) ?? []).map(
      (application) => application.id,
    ),
  };
}

export function displayName(application: PipelineApplication) {
  return `${application.candidateFirstName} ${application.candidateLastName}`.trim();
}

// ── Queue ───────────────────────────────────────────────────────────────────

/**
 * queued: waiting behind another write.
 * running: the request is in flight.
 * saved: the server confirmed it. Kept in the overlay until fresh server data
 *        arrives, so the card does not flicker back to its old column.
 */
export type QueuePhase = "queued" | "running" | "saved";

export type QueueEntry = {
  operation: BoardOperation;
  phase: QueuePhase;
};

export function deriveColumns(base: BoardColumns, entries: readonly QueueEntry[]) {
  let columns = base;
  for (const entry of entries) {
    columns = applyOperation(columns, entry.operation);
  }
  return columns;
}

export function enqueue(entries: readonly QueueEntry[], operation: BoardOperation) {
  return [...entries, { operation, phase: "queued" as const }];
}

export function nextQueued(entries: readonly QueueEntry[]) {
  if (entries.some((entry) => entry.phase === "running")) return null;
  return entries.find((entry) => entry.phase === "queued") ?? null;
}

export function markRunning(entries: readonly QueueEntry[], operationId: string) {
  return entries.map((entry) =>
    entry.operation.id === operationId ? { ...entry, phase: "running" as const } : entry,
  );
}

/**
 * Record the outcome of an operation. A confirmed write stays in the overlay as
 * `saved`. A failed write is removed, which rolls its change back, and every
 * write still waiting behind it is cancelled and returned so the caller can
 * tell the user about it. Cancelling is deliberate: a queued write was planned
 * against the optimistic board, so it cannot be trusted once its predecessor
 * failed.
 */
export function settle(
  entries: readonly QueueEntry[],
  operationId: string,
  outcome: "saved" | "failed",
): { entries: QueueEntry[]; cancelled: BoardOperation[] } {
  if (outcome === "saved") {
    return {
      entries: entries.map((entry) =>
        entry.operation.id === operationId ? { ...entry, phase: "saved" as const } : entry,
      ),
      cancelled: [],
    };
  }

  const remaining: QueueEntry[] = [];
  const cancelled: BoardOperation[] = [];
  for (const entry of entries) {
    if (entry.operation.id === operationId) continue;
    if (entry.phase === "queued") {
      cancelled.push(entry.operation);
      continue;
    }
    remaining.push(entry);
  }
  return { entries: remaining, cancelled };
}

/** Saved entries are dropped once fresh server data has replaced the base. */
export function pruneSaved(entries: readonly QueueEntry[]) {
  return entries.filter((entry) => entry.phase !== "saved");
}

export function hasUnfinished(entries: readonly QueueEntry[]) {
  return entries.some((entry) => entry.phase !== "saved");
}

/** Applications with a write waiting or in flight, for the card busy state. */
export function pendingApplicationIds(entries: readonly QueueEntry[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.phase === "saved") continue;
    for (const id of operationApplicationIds(entry.operation)) ids.add(id);
  }
  return ids;
}

// ── Failures and messages ───────────────────────────────────────────────────

export const THROWN_FAILURE_MESSAGE =
  "Something went wrong and the change was not saved. Please try again.";

export const FALLBACK_FAILURE_MESSAGE = "The change was not saved. Please try again.";

/** Prefer the server's message, which is written for people; never raw error text. */
export function failureMessage(serverError: string | null | undefined) {
  const trimmed = serverError?.trim();
  return trimmed ? trimmed : FALLBACK_FAILURE_MESSAGE;
}

export function cancelledMessage(count: number) {
  return count === 1
    ? "1 queued change was not applied because the one before it failed. The board has been refreshed."
    : `${count} queued changes were not applied because the one before them failed. The board has been refreshed.`;
}

export function successAnnouncement(operation: BoardOperation) {
  if (operation.kind === "move") {
    return `${operation.subject} moved to ${operation.toStageName}.`;
  }
  if (operation.kind === "bulkMove") {
    const count = operation.applicationIds.length;
    return `${count} candidate${count === 1 ? "" : "s"} moved to ${operation.toStageName}.`;
  }
  return `Status updated for ${operation.applicationIds.length} candidate${
    operation.applicationIds.length === 1 ? "" : "s"
  }.`;
}

export function warningMessage(operation: BoardOperation, emailWarning: string) {
  const headline =
    operation.kind === "status" ? "Status updated." : "Stage updated.";
  return `${headline} ${emailWarning}`;
}

// ── Settling a write ────────────────────────────────────────────────────────

/** What a server write returned, already reduced from exceptions. */
export type WriteOutcome =
  | { ok: true; warning?: string }
  | { ok: false; thrown: boolean; error?: string };

export type SettledToast =
  | { tone: "success" | "warning" | "error"; message: string };

export type Settlement = {
  entries: QueueEntry[];
  /** Polite live-region text for the outcome. */
  announcement: string;
  /** Inline error to show above the board; null after a success. */
  error: string | null;
  toasts: SettledToast[];
  /** Whether the server data should be re-read now. */
  refresh: boolean;
  /** Applications to drop from the selection (status and bulk writes). */
  deselect: string[];
  /** Keyboard-moved card to focus after this settles. */
  focusApplicationId: string | null;
  /** Keyboard-moved card to focus once the refreshed board mounts. */
  handoffFocusApplicationId: string | null;
  cancelled: number;
};

/**
 * Decide what a finished write does to the board. A success is kept in the
 * overlay and only the last one in the queue refreshes the server data (a
 * refresh remounts the board, which would drop queued writes). A failure is
 * rolled back, reported, and always refreshes, since the server is the only
 * reliable source of what actually changed.
 */
export function settleWrite(
  entries: readonly QueueEntry[],
  operation: BoardOperation,
  outcome: WriteOutcome,
): Settlement {
  const keyboardMove = operation.kind === "move" && operation.keyboard;
  const deselect = operation.kind === "move" ? [] : operationApplicationIds(operation);

  if (outcome.ok) {
    const result = settle(entries, operation.id, "saved");
    const toasts: SettledToast[] = [];
    if (outcome.warning) {
      toasts.push({ tone: "warning", message: warningMessage(operation, outcome.warning) });
    }
    const refresh = !hasUnfinished(result.entries);
    return {
      entries: result.entries,
      announcement: successAnnouncement(operation),
      error: null,
      toasts,
      refresh,
      deselect,
      focusApplicationId: keyboardMove ? operation.applicationId : null,
      // The refresh remounts the board, so focus has to follow the card across it.
      handoffFocusApplicationId: keyboardMove && refresh ? operation.applicationId : null,
      cancelled: 0,
    };
  }

  const result = settle(entries, operation.id, "failed");
  const message = outcome.thrown ? THROWN_FAILURE_MESSAGE : failureMessage(outcome.error);
  const toasts: SettledToast[] = [{ tone: "error", message }];
  let announcement = message;

  if (result.cancelled.length > 0) {
    const cancelled = cancelledMessage(result.cancelled.length);
    toasts.push({ tone: "warning", message: cancelled });
    announcement = `${message} ${cancelled}`;
  }

  return {
    entries: result.entries,
    announcement,
    error: message,
    toasts,
    refresh: true,
    deselect: [],
    focusApplicationId: keyboardMove ? operation.applicationId : null,
    handoffFocusApplicationId: null,
    cancelled: result.cancelled.length,
  };
}

// ── Column caps ─────────────────────────────────────────────────────────────

/** The slice of a column that is rendered, given its current cap. */
export function visibleApplications(
  applications: readonly PipelineApplication[],
  limit: number,
) {
  return applications.slice(0, limit);
}

/** How many more cards "Show more" will reveal. */
export function nextPageSize(total: number, limit: number) {
  return Math.min(CARD_PAGE_SIZE, Math.max(0, total - limit));
}

/**
 * The cap needed so a card at `index` is rendered. Rounds up to a whole page so
 * the column reveals in the same steps as "Show more".
 */
export function limitToReveal(index: number) {
  return Math.ceil((index + 1) / CARD_PAGE_SIZE) * CARD_PAGE_SIZE;
}
