import { describe, expect, it } from "vitest";

import {
  applyOperation,
  buildColumns,
  settleWrite,
  THROWN_FAILURE_MESSAGE,
  CARD_PAGE_SIZE,
  cancelledMessage,
  deriveColumns,
  enqueue,
  failureMessage,
  FALLBACK_FAILURE_MESSAGE,
  hasUnfinished,
  limitToReveal,
  markRunning,
  nextPageSize,
  nextQueued,
  pendingApplicationIds,
  planDropOperation,
  pruneSaved,
  settle,
  successAnnouncement,
  visibleApplications,
  warningMessage,
  type BoardColumns,
  type BoardOperation,
  type MoveOperation,
  type QueueEntry,
} from "@/features/pipeline/board-state";
import type {
  PipelineApplication,
  PipelineStage,
} from "@/features/pipeline/data";

const WORKSPACE = "ws-1";
const ISSUED = "2026-10-28T10:00:00.000Z";

function stage(
  id: string,
  name: string,
  kind: PipelineStage["kind"],
  order: number,
): PipelineStage {
  return {
    id,
    name,
    kind,
    color: null,
    order,
    emailConfig: { candidateUpdatesEnabled: true },
  };
}

function application(
  id: string,
  currentStageId: string,
  overrides: Partial<PipelineApplication> = {},
): PipelineApplication {
  return {
    id,
    workspaceId: WORKSPACE,
    jobId: "job-1",
    jobTitle: "Engineer",
    candidateId: `cand-${id}`,
    currentStageId,
    pipelineOrder: 0,
    candidateFirstName: id.toUpperCase(),
    candidateLastName: "Candidate",
    candidateEmail: `${id}@example.test`,
    candidateHeadline: null,
    candidateAvatarUrl: null,
    candidateAvatarFallbackSrcs: [],
    source: null,
    status: "active",
    appliedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    lastStageMovedAt: null,
    aiScore: null,
    evaluationSource: null,
    evaluationEngineVersion: null,
    aiRecommendation: null,
    aiSummary: null,
    aiUsedResume: null,
    isFeaturedReferral: false,
    ...overrides,
  };
}

const stages: PipelineStage[] = [
  stage("s-applied", "Applied", "applied", 0),
  stage("s-screen", "Screening", "screening", 1),
  stage("s-custom", "Panel review", "custom", 2),
  stage("s-hired", "Hired", "hired", 3),
  stage("s-rejected", "Rejected", "rejected", 4),
];

function sampleColumns(applications: PipelineApplication[]) {
  return buildColumns(stages, applications);
}

function ids(columns: BoardColumns, stageId: string) {
  return (columns.get(stageId) ?? []).map((item) => item.id);
}

function moveOp(
  overrides: Partial<Omit<MoveOperation, "kind">> & { id: string },
): MoveOperation {
  return {
    kind: "move",
    workspaceId: WORKSPACE,
    subject: "Subject",
    issuedAt: ISSUED,
    applicationId: "a",
    fromStageId: "s-applied",
    toStageId: "s-screen",
    toStageName: "Screening",
    index: 0,
    outcome: "active",
    orderedApplicationIds: [],
    keyboard: false,
    ...overrides,
  };
}

describe("buildColumns", () => {
  it("groups applications by stage and ignores stages that are not on the board", () => {
    const columns = sampleColumns([
      application("a", "s-applied"),
      application("b", "s-screen"),
      application("c", "s-archived-stage"),
    ]);

    expect(ids(columns, "s-applied")).toEqual(["a"]);
    expect(ids(columns, "s-screen")).toEqual(["b"]);
    expect(columns.has("s-archived-stage")).toBe(false);
  });
});

describe("planDropOperation", () => {
  it("returns null when a card is dropped on its own position", () => {
    const columns = sampleColumns([application("a", "s-screen"), application("b", "s-screen")]);

    const operation = planDropOperation({
      id: "op-1",
      columns,
      stages,
      applicationId: "a",
      overId: "b",
      issuedAt: ISSUED,
      keyboard: false,
    });

    expect(operation).toBeNull();
  });

  it("moves a card to a later position in its own column, compensating for removal", () => {
    const columns = sampleColumns([
      application("a", "s-screen"),
      application("b", "s-screen"),
      application("c", "s-screen"),
    ]);

    const operation = planDropOperation({
      id: "op-1",
      columns,
      stages,
      applicationId: "a",
      overId: "c",
      issuedAt: ISSUED,
      keyboard: false,
    });

    expect(operation?.index).toBe(1);
    expect(operation?.orderedApplicationIds).toEqual(["b", "a", "c"]);
  });

  it("appends to a stage when the drop target is the column itself", () => {
    const columns = sampleColumns([application("a", "s-applied"), application("b", "s-screen")]);

    const operation = planDropOperation({
      id: "op-1",
      columns,
      stages,
      applicationId: "a",
      overId: "s-screen",
      issuedAt: ISSUED,
      keyboard: true,
    });

    expect(operation).toMatchObject({
      fromStageId: "s-applied",
      toStageId: "s-screen",
      index: 1,
      keyboard: true,
      orderedApplicationIds: ["b", "a"],
    });
  });

  it("takes the outcome from the stage kind, so a hired stage makes the card hired", () => {
    const columns = sampleColumns([application("a", "s-screen")]);

    const operation = planDropOperation({
      id: "op-1",
      columns,
      stages,
      applicationId: "a",
      overId: "s-hired",
      issuedAt: ISSUED,
      keyboard: false,
    });

    expect(operation?.outcome).toBe("hired");
  });

  it("treats a custom stage as active even if its name sounds terminal", () => {
    const custom = [...stages, stage("s-offer-call", "Offer call", "custom", 5)];

    const operation = planDropOperation({
      id: "op-1",
      columns: buildColumns(custom, [application("a", "s-screen")]),
      stages: custom,
      applicationId: "a",
      overId: "s-offer-call",
      issuedAt: ISSUED,
      keyboard: false,
    });

    expect(operation?.outcome).toBe("active");
  });

  it("resolves a NULL-kind stage named Hired (legacy row) as a hire", () => {
    const legacy = [
      stage("s-screen", "Screening", "screening", 0),
      { ...stage("s-legacy-hired", "Hired", "hired", 1), kind: null as unknown as PipelineStage["kind"] },
    ];
    const operation = planDropOperation({
      id: "op-1",
      columns: buildColumns(legacy, [application("a", "s-screen")]),
      stages: legacy,
      applicationId: "a",
      overId: "s-legacy-hired",
      issuedAt: ISSUED,
      keyboard: false,
    });

    expect(operation?.outcome).toBe("hired");
  });

  it("returns null when the target stage is unknown", () => {
    const columns = sampleColumns([application("a", "s-screen")]);

    expect(
      planDropOperation({
        id: "op-1",
        columns,
        stages,
        applicationId: "a",
        overId: "no-such-stage",
        issuedAt: ISSUED,
        keyboard: false,
      }),
    ).toBeNull();
  });
});

describe("applyOperation", () => {
  it("moves a card, updates its stage and status, and stamps the stage move", () => {
    const base = sampleColumns([application("a", "s-screen"), application("b", "s-applied")]);
    const next = applyOperation(base, moveOp({ id: "op", applicationId: "a", fromStageId: "s-screen", toStageId: "s-hired", toStageName: "Hired", outcome: "hired", index: 0 }));

    expect(ids(next, "s-screen")).toEqual([]);
    expect(ids(next, "s-hired")).toEqual(["a"]);
    expect(next.get("s-hired")?.[0]).toMatchObject({
      currentStageId: "s-hired",
      status: "hired",
      lastStageMovedAt: ISSUED,
    });
  });

  it("does not change the base columns it was given", () => {
    const base = sampleColumns([application("a", "s-screen")]);
    applyOperation(base, moveOp({ id: "op", applicationId: "a", toStageId: "s-hired", outcome: "hired" }));

    expect(ids(base, "s-screen")).toEqual(["a"]);
    expect(ids(base, "s-hired")).toEqual([]);
  });

  it("applies a status change to every selected application", () => {
    const base = sampleColumns([application("a", "s-screen"), application("b", "s-applied"), application("c", "s-applied")]);
    const next = applyOperation(base, {
      kind: "status",
      id: "op",
      workspaceId: WORKSPACE,
      subject: "2 candidates",
      issuedAt: ISSUED,
      applicationIds: ["a", "b"],
      status: "rejected",
    });

    expect(next.get("s-screen")?.[0].status).toBe("rejected");
    expect(next.get("s-applied")?.map((item) => item.status)).toEqual(["rejected", "active"]);
  });

  it("moves a bulk selection to the end of the target column with its outcome", () => {
    const base = sampleColumns([application("a", "s-applied"), application("b", "s-applied"), application("c", "s-hired")]);
    const next = applyOperation(base, {
      kind: "bulkMove",
      id: "op",
      workspaceId: WORKSPACE,
      subject: "2 candidates",
      issuedAt: ISSUED,
      applicationIds: ["a", "b"],
      toStageId: "s-rejected",
      toStageName: "Rejected",
      outcome: "rejected",
    });

    expect(ids(next, "s-applied")).toEqual([]);
    expect(ids(next, "s-rejected")).toEqual(["a", "b"]);
    expect(next.get("s-rejected")?.every((item) => item.status === "rejected")).toBe(true);
  });
});

describe("write queue", () => {
  const base = sampleColumns([
    application("a", "s-applied"),
    application("b", "s-applied"),
    application("c", "s-screen"),
  ]);

  function entry(operation: BoardOperation): QueueEntry {
    return { operation, phase: "queued" };
  }

  it("shows queued writes on top of the server state without touching it", () => {
    const first = moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen" });
    let entries: QueueEntry[] = [];
    entries = enqueue(entries, first);

    const shown = deriveColumns(base, entries);
    expect(ids(shown, "s-screen")).toEqual(["a", "c"]);
    expect(ids(base, "s-applied")).toEqual(["a", "b"]);
  });

  it("keeps a second drop made while the first is in flight, and runs it next", () => {
    let entries: QueueEntry[] = [];
    entries = enqueue(entries, moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen" }));
    entries = enqueue(entries, moveOp({ id: "op-2", applicationId: "b", toStageId: "s-custom", toStageName: "Panel review" }));

    entries = markRunning(entries, "op-1");
    expect(nextQueued(entries)).toBeNull();

    const settled = settle(entries, "op-1", "saved");
    expect(settled.cancelled).toEqual([]);
    expect(nextQueued(settled.entries)?.operation.id).toBe("op-2");
  });

  it("rolls a failed write back exactly, and cancels the writes queued behind it", () => {
    let entries: QueueEntry[] = [];
    entries = enqueue(entries, moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen" }));
    entries = enqueue(entries, moveOp({ id: "op-2", applicationId: "b", toStageId: "s-custom", toStageName: "Panel review" }));
    entries = markRunning(entries, "op-1");

    const failed = settle(entries, "op-1", "failed");

    expect(failed.cancelled.map((operation) => operation.id)).toEqual(["op-2"]);
    expect(failed.entries).toEqual([]);
    expect(deriveColumns(base, failed.entries)).toEqual(base);
  });

  it("rolls back a failed bulk move as a whole", () => {
    const bulk = {
      kind: "bulkMove" as const,
      id: "bulk-1",
      workspaceId: WORKSPACE,
      subject: "2 candidates",
      issuedAt: ISSUED,
      applicationIds: ["a", "b"],
      toStageId: "s-hired",
      toStageName: "Hired",
      outcome: "hired" as const,
    };
    const entries = markRunning([entry(bulk)], "bulk-1");

    const failed = settle(entries, "bulk-1", "failed");
    const shown = deriveColumns(base, failed.entries);

    expect(ids(shown, "s-applied")).toEqual(["a", "b"]);
    expect(ids(shown, "s-hired")).toEqual([]);
  });

  it("keeps a saved write in the overlay until fresh server data arrives", () => {
    const saved = settle(
      markRunning([entry(moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen" }))], "op-1"),
      "op-1",
      "saved",
    );

    expect(ids(deriveColumns(base, saved.entries), "s-screen")).toContain("a");
    expect(hasUnfinished(saved.entries)).toBe(false);
    expect(pruneSaved(saved.entries)).toEqual([]);
  });

  it("reports busy applications only while a write is waiting or in flight", () => {
    let entries: QueueEntry[] = [];
    entries = enqueue(entries, moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen" }));
    entries = enqueue(entries, {
      kind: "status",
      id: "op-2",
      workspaceId: WORKSPACE,
      subject: "B",
      issuedAt: ISSUED,
      applicationIds: ["b"],
      status: "withdrawn",
    });

    expect([...pendingApplicationIds(entries)].sort()).toEqual(["a", "b"]);

    const saved = settle(markRunning(entries, "op-1"), "op-1", "saved");
    expect([...pendingApplicationIds(saved.entries)]).toEqual(["b"]);
  });
});

describe("messages", () => {
  it("prefers the server message and never shows raw text when none is given", () => {
    expect(failureMessage("Workspace access denied.")).toBe("Workspace access denied.");
    expect(failureMessage("   ")).toBe(FALLBACK_FAILURE_MESSAGE);
    expect(failureMessage(undefined)).toBe(FALLBACK_FAILURE_MESSAGE);
  });

  it("explains cancelled writes in the singular and the plural", () => {
    expect(cancelledMessage(1)).toMatch(/^1 queued change was not applied/);
    expect(cancelledMessage(3)).toMatch(/^3 queued changes were not applied/);
  });

  it("announces success and email warnings in plain language", () => {
    const move = moveOp({ id: "m", subject: "Ada Lovelace", toStageName: "Interview" });
    expect(successAnnouncement(move)).toBe("Ada Lovelace moved to Interview.");
    expect(warningMessage(move, "Email is queued.")).toBe("Stage updated. Email is queued.");
    expect(
      warningMessage(
        { kind: "status", id: "s", workspaceId: WORKSPACE, subject: "x", issuedAt: ISSUED, applicationIds: ["a"], status: "hired" },
        "Email is queued.",
      ),
    ).toBe("Status updated. Email is queued.");
  });
});

describe("column caps", () => {
  it("renders one page per column initially", () => {
    expect(CARD_PAGE_SIZE).toBe(50);
    const many = Array.from({ length: 5000 }, (_, index) => application(`p${index}`, "s-screen"));

    expect(visibleApplications(many, CARD_PAGE_SIZE)).toHaveLength(50);
    expect(nextPageSize(5000, CARD_PAGE_SIZE)).toBe(50);
    expect(nextPageSize(120, 100)).toBe(20);
    expect(nextPageSize(10, 50)).toBe(0);
  });

  it("reveals a whole page when a drop lands beyond the cap", () => {
    expect(limitToReveal(0)).toBe(50);
    expect(limitToReveal(49)).toBe(50);
    expect(limitToReveal(50)).toBe(100);
    expect(limitToReveal(124)).toBe(150);
  });
});

describe("settleWrite", () => {
  const base = sampleColumns([
    application("a", "s-applied"),
    application("b", "s-applied"),
    application("c", "s-screen"),
  ]);

  function running(operations: BoardOperation[]): QueueEntry[] {
    let entries: QueueEntry[] = [];
    for (const operation of operations) entries = enqueue(entries, operation);
    return markRunning(entries, operations[0].id);
  }

  const first = moveOp({ id: "op-1", applicationId: "a", toStageId: "s-screen", index: 1 });
  const second = moveOp({ id: "op-2", applicationId: "b", toStageId: "s-custom", toStageName: "Panel review", index: 0 });

  it("keeps a successful write, announces it, and refreshes once nothing is left", () => {
    const result = settleWrite(running([first]), first, { ok: true });

    expect(result.error).toBeNull();
    expect(result.toasts).toEqual([]);
    expect(result.refresh).toBe(true);
    expect(result.announcement).toBe("Subject moved to Screening.");
    expect(ids(deriveColumns(base, result.entries), "s-screen")).toContain("a");
  });

  it("shows an email warning as a non-blocking warning toast", () => {
    const result = settleWrite(running([first]), first, {
      ok: true,
      warning: "Ada's email will be retried automatically.",
    });

    expect(result.error).toBeNull();
    expect(result.toasts).toEqual([
      { tone: "warning", message: "Stage updated. Ada's email will be retried automatically." },
    ]);
  });

  it("rolls back a server failure and shows the server's own message", () => {
    const result = settleWrite(running([first]), first, {
      ok: false,
      thrown: false,
      error: "Workspace access denied.",
    });

    expect(result.entries).toEqual([]);
    expect(deriveColumns(base, result.entries)).toEqual(base);
    expect(result.error).toBe("Workspace access denied.");
    expect(result.toasts).toEqual([{ tone: "error", message: "Workspace access denied." }]);
    expect(result.refresh).toBe(true);
  });

  it("never leaks raw text from a thrown exception", () => {
    const result = settleWrite(running([first]), first, { ok: false, thrown: true });

    expect(result.error).toBe(THROWN_FAILURE_MESSAGE);
    expect(result.toasts[0]).toEqual({ tone: "error", message: THROWN_FAILURE_MESSAGE });
    expect(result.error).not.toMatch(/Error|TypeError|undefined|null/);
    expect(deriveColumns(base, result.entries)).toEqual(base);
    expect(result.refresh).toBe(true);
  });

  it("treats a concurrency conflict as a failure that refetches, and cancels what waits behind it", () => {
    const conflictMessage = "Application changed by another recruiter. Refresh and try again.";
    const result = settleWrite(running([first, second]), first, {
      ok: false,
      thrown: false,
      error: conflictMessage,
    });

    expect(result.error).toBe(conflictMessage);
    expect(result.refresh).toBe(true);
    expect(result.cancelled).toBe(1);
    expect(result.toasts.map((toast) => toast.tone)).toEqual(["error", "warning"]);
    expect(result.announcement).toContain(conflictMessage);
    expect(result.announcement).toContain("1 queued change was not applied");
    expect(result.entries).toEqual([]);
  });

  it("does not refresh while a queued drop is still waiting, so it is not lost", () => {
    const result = settleWrite(running([first, second]), first, { ok: true });

    expect(result.refresh).toBe(false);
    expect(nextQueued(result.entries)?.operation.id).toBe("op-2");
  });

  it("refreshes after the last queued drop succeeds", () => {
    const afterFirst = settleWrite(running([first, second]), first, { ok: true });
    const queued = markRunning(afterFirst.entries, "op-2");
    const afterSecond = settleWrite(queued, second, { ok: true });

    expect(afterSecond.refresh).toBe(true);
    const shown = deriveColumns(base, afterSecond.entries);
    expect(ids(shown, "s-custom")).toEqual(["b"]);
    expect(ids(shown, "s-screen")).toEqual(["c", "a"]);
  });

  it("rolls back a failed bulk move as a whole and keeps the selection", () => {
    const bulk = {
      kind: "bulkMove" as const,
      id: "bulk-1",
      workspaceId: WORKSPACE,
      subject: "2 candidates",
      issuedAt: ISSUED,
      applicationIds: ["a", "b"],
      toStageId: "s-hired",
      toStageName: "Hired",
      outcome: "hired" as const,
    };
    const result = settleWrite(running([bulk]), bulk, {
      ok: false,
      thrown: false,
      error: "One or more applications were not found.",
    });

    expect(deriveColumns(base, result.entries)).toEqual(base);
    expect(result.deselect).toEqual([]);
    expect(result.error).toBe("One or more applications were not found.");
  });

  it("clears the selection for a successful status change and announces it", () => {
    const status = {
      kind: "status" as const,
      id: "status-1",
      workspaceId: WORKSPACE,
      subject: "2 candidates",
      issuedAt: ISSUED,
      applicationIds: ["a", "b"],
      status: "rejected" as const,
    };
    const result = settleWrite(running([status]), status, { ok: true });

    expect(result.deselect).toEqual(["a", "b"]);
    expect(result.announcement).toBe("Status updated for 2 candidates.");
  });

  it("returns focus to a keyboard-moved card, and hands it across the refresh", () => {
    const keyboardFirst = { ...first, keyboard: true };
    const result = settleWrite(running([keyboardFirst]), keyboardFirst, { ok: true });

    expect(result.focusApplicationId).toBe("a");
    expect(result.handoffFocusApplicationId).toBe("a");
  });

  it("does not hand focus across a refresh that is still waiting on other drops", () => {
    const keyboardFirst = { ...first, keyboard: true };
    const result = settleWrite(running([keyboardFirst, second]), keyboardFirst, { ok: true });

    expect(result.focusApplicationId).toBe("a");
    expect(result.handoffFocusApplicationId).toBeNull();
  });

  it("returns focus to a keyboard-moved card after a rollback, with no handoff", () => {
    const keyboardFirst = { ...first, keyboard: true };
    const result = settleWrite(running([keyboardFirst]), keyboardFirst, {
      ok: false,
      thrown: false,
      error: "Nope.",
    });

    expect(result.focusApplicationId).toBe("a");
    expect(result.handoffFocusApplicationId).toBeNull();
  });
});
