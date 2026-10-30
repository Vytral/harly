import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/pipeline/actions", () => ({
  bulkMoveApplications: vi.fn(),
  moveApplicationInPipeline: vi.fn(),
  updateApplicationStatus: vi.fn(),
}));

import {
  BoardWriteQueue,
  boardWriteQueueFor,
} from "@/features/pipeline/board-write-queue";
import type {
  BoardOperation,
  MoveOperation,
  WriteOutcome,
} from "@/features/pipeline/board-state";

function move(id: string, applicationId: string): MoveOperation {
  return {
    kind: "move",
    id,
    workspaceId: "ws-1",
    subject: applicationId,
    issuedAt: "2026-10-28T10:00:00.000Z",
    applicationId,
    fromStageId: "s-applied",
    toStageId: "s-screen",
    toStageName: "Screening",
    index: 0,
    outcome: "active",
    orderedApplicationIds: [applicationId],
    keyboard: false,
  };
}

/** A write the test resolves by hand, so ordering can be observed. */
function controlledWrites() {
  const pending: Array<{ operation: BoardOperation; resolve: (outcome: WriteOutcome) => void }> = [];
  const write = vi.fn(
    (operation: BoardOperation) =>
      new Promise<WriteOutcome>((resolve) => {
        pending.push({ operation, resolve });
      }),
  );
  return { write, pending };
}

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe("BoardWriteQueue", () => {
  it("runs one write at a time, in the order they were made", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);

    queue.enqueue(move("op-1", "a"));
    queue.enqueue(move("op-2", "b"));

    expect(write).toHaveBeenCalledTimes(1);
    expect(pending[0].operation.id).toBe("op-1");

    pending[0].resolve({ ok: true });
    await flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(pending[1].operation.id).toBe("op-2");
  });

  it("keeps a drop made during an in-flight write, and does not lose it on a remount", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);
    const firstSink = vi.fn();
    const detachFirst = queue.attach({ onSettled: firstSink });

    queue.enqueue(move("op-1", "a"));
    queue.enqueue(move("op-2", "b"));

    // The board remounts while op-1 is in flight: the old instance detaches.
    detachFirst();
    const secondSink = vi.fn();
    queue.attach({ onSettled: secondSink });

    pending[0].resolve({ ok: true });
    await flush();

    expect(pending[1].operation.id).toBe("op-2");
    pending[1].resolve({ ok: true });
    await flush();

    expect(firstSink).not.toHaveBeenCalled();
    expect(secondSink.mock.calls.map(([operation]) => operation.id)).toEqual(["op-1", "op-2"]);
    expect(queue.getEntries().filter((entry) => entry.phase !== "saved")).toEqual([]);
  });

  it("cancels the writes behind a failure and reports the cancellation", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);
    const sink = vi.fn();
    queue.attach({ onSettled: sink });

    queue.enqueue(move("op-1", "a"));
    queue.enqueue(move("op-2", "b"));
    pending[0].resolve({ ok: false, thrown: false, error: "Workspace access denied." });
    await flush();

    expect(write).toHaveBeenCalledTimes(1);
    const [, settlement] = sink.mock.calls[0];
    expect(settlement.error).toBe("Workspace access denied.");
    expect(settlement.cancelled).toBe(1);
    expect(queue.getEntries()).toEqual([]);
  });

  it("keeps running queued writes when no board is mounted", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);

    queue.enqueue(move("op-1", "a"));
    queue.enqueue(move("op-2", "b"));
    pending[0].resolve({ ok: true });
    await flush();

    expect(pending[1].operation.id).toBe("op-2");
  });

  it("notifies subscribers as the queue changes, and prunes saved writes", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);
    const listener = vi.fn();
    queue.subscribe(listener);

    queue.enqueue(move("op-1", "a"));
    expect(listener).toHaveBeenCalled();

    pending[0].resolve({ ok: true });
    await flush();
    expect(queue.getEntries()).toEqual([
      expect.objectContaining({ phase: "saved" }),
    ]);

    queue.pruneSaved();
    expect(queue.getEntries()).toEqual([]);
  });

  it("ignores a stale detach, so the mounted board keeps receiving outcomes", async () => {
    const { write, pending } = controlledWrites();
    const queue = new BoardWriteQueue(write);
    const first = vi.fn();
    const second = vi.fn();
    const detachFirst = queue.attach({ onSettled: first });
    queue.attach({ onSettled: second });

    detachFirst();
    queue.enqueue(move("op-1", "a"));
    pending[0].resolve({ ok: true });
    await flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("gives every board for a job the same queue", () => {
    expect(boardWriteQueueFor("job-1")).toBe(boardWriteQueueFor("job-1"));
    expect(boardWriteQueueFor("job-1")).not.toBe(boardWriteQueueFor("job-2"));
  });
});
