import { toast } from "sonner";

import {
  bulkMoveApplications,
  moveApplicationInPipeline,
  updateApplicationStatus,
} from "@/features/pipeline/actions";
import {
  enqueue,
  markRunning,
  nextQueued,
  pruneSaved,
  settleWrite,
  type BoardOperation,
  type QueueEntry,
  type Settlement,
  type SettledToast,
  type WriteOutcome,
} from "@/features/pipeline/board-state";

/**
 * Writes for one job's board, run one at a time, in the order they were made.
 *
 * The queue lives outside React on purpose. A successful write refreshes the
 * server data, which remounts the board; a queue held in component state would
 * be dropped with it, and a drop still waiting would vanish without a word. Here
 * the queue keeps draining across remounts, and the board reads it through
 * `useSyncExternalStore`.
 */

type Sink = {
  onSettled: (operation: BoardOperation, settlement: Settlement) => void;
};

/** Converts a server action's result into an outcome, without exceptions. */
function toWriteOutcome(result: {
  success: boolean;
  error?: string;
  emailWarning?: string;
}): WriteOutcome {
  return result.success
    ? { ok: true, warning: result.emailWarning }
    : { ok: false, thrown: false, error: result.error };
}

/**
 * Runs one write. A thrown exception becomes a generic outcome, so raw error
 * text never reaches the screen; the details go to the console in development.
 */
export async function runBoardWrite(operation: BoardOperation): Promise<WriteOutcome> {
  try {
    if (operation.kind === "move") {
      return toWriteOutcome(
        await moveApplicationInPipeline({
          applicationId: operation.applicationId,
          fromStageId: operation.fromStageId,
          toStageId: operation.toStageId,
          workspaceId: operation.workspaceId,
          orderedApplicationIds: operation.orderedApplicationIds,
        }),
      );
    }

    if (operation.kind === "status") {
      return toWriteOutcome(
        await updateApplicationStatus({
          applicationIds: operation.applicationIds,
          workspaceId: operation.workspaceId,
          status: operation.status,
        }),
      );
    }

    return toWriteOutcome(
      await bulkMoveApplications({
        applicationIds: operation.applicationIds,
        toStageId: operation.toStageId,
        workspaceId: operation.workspaceId,
      }),
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[pipeline-board] write failed", error);
    }
    return { ok: false, thrown: true };
  }
}

/** Shows one settlement toast; used by a mounted board or, when none is, the queue. */
export function showSettledToast(item: SettledToast) {
  if (item.tone === "success") toast.success(item.message);
  else if (item.tone === "warning") toast.warning(item.message);
  else toast.error(item.message);
}

export class BoardWriteQueue {
  private entries: QueueEntry[] = [];
  private running = false;
  private sink: Sink | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly write: (operation: BoardOperation) => Promise<WriteOutcome> = runBoardWrite,
  ) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getEntries = () => this.entries;

  /**
   * The mounted board that reports outcomes. Returns the detach function, which
   * only clears the sink if it is still this one (a remount attaches first).
   */
  attach(sink: Sink): () => void {
    this.sink = sink;
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  enqueue(operation: BoardOperation) {
    this.replace(enqueue(this.entries, operation));
    this.pump();
  }

  /** Saved writes are part of the server data now; drop them from the overlay. */
  pruneSaved() {
    const next = pruneSaved(this.entries);
    if (next.length !== this.entries.length) this.replace(next);
  }

  private replace(next: QueueEntry[]) {
    this.entries = next;
    for (const listener of this.listeners) listener();
  }

  private pump() {
    if (this.running) return;
    const head = nextQueued(this.entries);
    if (!head) return;

    this.running = true;
    this.replace(markRunning(this.entries, head.operation.id));

    void this.write(head.operation).then((outcome) => {
      this.running = false;
      const settlement = settleWrite(this.entries, head.operation, outcome);
      this.replace(settlement.entries);
      if (this.sink) {
        this.sink.onSettled(head.operation, settlement);
      } else {
        // The board was left before the write finished: the outcome still has
        // to reach the person, so it goes out as a toast from here.
        for (const item of settlement.toasts) showSettledToast(item);
      }
      this.pump();
    });
  }
}

const queues = new Map<string, BoardWriteQueue>();

/** One queue per job, shared by every board instance for that job. */
export function boardWriteQueueFor(jobId: string) {
  let queue = queues.get(jobId);
  if (!queue) {
    queue = new BoardWriteQueue();
    queues.set(jobId, queue);
  }
  return queue;
}
