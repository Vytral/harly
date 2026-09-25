import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dispatcher tests (FASE 2.3 + 2.4). We stub the DB + the engine and assert
 * that dispatchWorkflowEvent:
 *  - creates a run for each enabled workflow whose trigger matches the event,
 *  - skips workflows whose trigger.filter doesn't match the payload,
 *  - ignores events that are not valid workflow triggers,
 *  - skips re-entrant runs (anti-loop).
 */

const dbState: {
  workflows: Array<{ id: string; trigger: { filter?: Record<string, unknown> } | null }>;
  runsInserted: Array<{ workflowId: string; triggerEvent: string; triggerPayload: unknown; sourceEventId?: string | null }>;
  runningRuns: Array<{ workflowId: string; triggerEvent: string; triggerPayload?: unknown }>;
  /** When set, the anti-loop query rejects — exercises fail-closed dispatch. */
  antiLoopError: Error | null;
} = { workflows: [], runsInserted: [], runningRuns: [], antiLoopError: null };

const { findDueWorkflowRuns } = vi.hoisted(() => ({
  findDueWorkflowRuns: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    // The dispatcher's workflow lookup resolves at .where() (awaited directly).
    // The anti-loop check adds .orderBy().limit() before the await. We return a
    // thenable at .where() that resolves to the workflows, and chain methods
    // that resolve to the running runs set.
    select: vi.fn(() => ({
      from: () => {
        // A thenable that resolves to the workflow list when awaited directly,
        // but also exposes .orderBy()/.limit() for the anti-loop query.
        const thenable: Promise<unknown> & {
          orderBy?: () => { limit: () => Promise<unknown> };
          limit?: () => Promise<unknown>;
        } = Promise.resolve(dbState.workflows) as never;
        thenable.orderBy = () => ({
          limit: () =>
            dbState.antiLoopError
              ? Promise.reject(dbState.antiLoopError)
              : Promise.resolve(
                  dbState.runningRuns.map((r) => ({
                    id: `run-${r.workflowId}`,
                    triggerPayload: r.triggerPayload ?? { application: { id: "app-1" } },
                  })),
                ),
        });
        thenable.limit = () => Promise.resolve(dbState.workflows);
        return {
          where: () => thenable,
        };
      },
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        dbState.runsInserted.push({
          workflowId: row.workflowId as string,
          triggerEvent: row.triggerEvent as string,
          triggerPayload: row.triggerPayload,
          sourceEventId: row.sourceEventId as string | null | undefined,
        });
        return {
          returning: () => Promise.resolve([{ id: `run-${row.workflowId}` }]),
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: `run-${row.workflowId}` }]),
          }),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: () => Promise.resolve([]) })),
      })),
    })),
  },
  workflowDefinitions: {},
  workflowRuns: {},
}));

// Stub the engine so dispatch never actually runs a workflow in this test.
vi.mock("./engine", () => ({
  runWorkflow: vi.fn().mockResolvedValue({ status: "succeeded", run: { id: "x" } }),
}));

// The dispatcher delegates execution and wait resolution to the v2 worker.
// Keep these unit tests focused on trigger selection; the worker has its own
// Postgres integration suite with the real graph tables.
vi.mock("./runtime/worker", () => ({
  resumeWorkflowEventWaits: vi.fn().mockResolvedValue(0),
  runWorkflowV2: vi.fn().mockResolvedValue({ status: "succeeded" }),
}));

vi.mock("./runtime/due-runs", () => ({ findDueWorkflowRuns }));

vi.mock("./runtime/operational-policy", () => ({
  reserveRunAdmissionPolicy: vi.fn().mockResolvedValue({ ok: true }),
}));

// Exercise the dispatcher internals explicitly with the v2 launch switch on.
vi.mock("./status", () => ({ AUTOMATIONS_ENABLED: true, legacyWorkflowDispatchDisabled: () => false }));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    void fn();
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import { dispatchDueWorkflowRuns, dispatchWorkflowEvent, reclaimStalledWorkflowRuns } from "./dispatch";

describe("workflow dispatcher — FASE 2.3 trigger matching", () => {
  beforeEach(() => {
    dbState.workflows = [];
    dbState.runsInserted = [];
    dbState.runningRuns = [];
    dbState.antiLoopError = null;
    findDueWorkflowRuns.mockReset();
  });

  it("surfaces a due-queue database failure to the scheduler", async () => {
    findDueWorkflowRuns.mockRejectedValue(new Error("database unavailable"));

    await expect(dispatchDueWorkflowRuns()).rejects.toThrow("database unavailable");
  });

  it("creates a run for each enabled workflow whose trigger event matches", async () => {
    dbState.workflows = [
      { id: "wf-a", trigger: null },
      { id: "wf-b", trigger: null },
    ];

    await dispatchWorkflowEvent("ws-1", "application.created", {
      application: { id: "app-1" },
    });

    expect(dbState.runsInserted).toHaveLength(2);
    expect(dbState.runsInserted.map((r) => r.workflowId)).toEqual(["wf-a", "wf-b"]);
    expect(dbState.runsInserted[0]).toMatchObject({ triggerEvent: "application.created" });
  });

  it("skips workflows whose trigger.filter does not match the payload", async () => {
    dbState.workflows = [
      { id: "wf-match", trigger: { filter: { jobId: "job-1" } } },
      { id: "wf-skip", trigger: { filter: { jobId: "job-2" } } },
    ];

    await dispatchWorkflowEvent("ws-1", "application.created", {
      application: { id: "app-1", jobId: "job-1" },
    });

    expect(dbState.runsInserted).toHaveLength(1);
    expect(dbState.runsInserted[0]?.workflowId).toBe("wf-match");
  });

  it("matches a stage filter against nested toStageId payloads", async () => {
    dbState.workflows = [
      { id: "wf-stage", trigger: { filter: { toStageId: "stage-tech" } } },
    ];

    await dispatchWorkflowEvent("ws-1", "application.stage_changed", {
      application: { id: "app-1", jobId: "job-1" },
      toStageId: "stage-tech",
    });

    expect(dbState.runsInserted).toHaveLength(1);
    expect(dbState.runsInserted[0]?.workflowId).toBe("wf-stage");
  });

  it("records eventId from the payload when sourceEventId is omitted", async () => {
    dbState.workflows = [{ id: "wf-a", trigger: null }];

    await dispatchWorkflowEvent("ws-1", "application.created", {
      application: { id: "app-1" },
      eventId: "event-from-payload",
    });

    expect(dbState.runsInserted[0]?.sourceEventId).toBe("event-from-payload");
  });

  it("runs a workflow with no filter on every matching event", async () => {
    dbState.workflows = [{ id: "wf-open", trigger: null }];

    await dispatchWorkflowEvent("ws-1", "interview.completed", {
      interview: { id: "iv-1" },
    });

    expect(dbState.runsInserted).toHaveLength(1);
  });

  it("dispatches interview cancellation now that it is a workflow trigger", async () => {
    dbState.workflows = [{ id: "wf-x", trigger: null }];

    await dispatchWorkflowEvent("ws-1", "interview.canceled", { interview: { id: "iv-1" } });

    expect(dbState.runsInserted).toHaveLength(1);
  });

  it("does nothing when no workflows match the event", async () => {
    dbState.workflows = [];
    await dispatchWorkflowEvent("ws-1", "application.created", { application: { id: "app-1" } });
    expect(dbState.runsInserted).toHaveLength(0);
  });

  it("records the trigger payload on the run", async () => {
    dbState.workflows = [{ id: "wf-a", trigger: null }];
    const payload = { application: { id: "app-1" }, candidateId: "cand-1" };

    await dispatchWorkflowEvent("ws-1", "application.created", payload);

    expect(dbState.runsInserted[0]?.triggerPayload).toEqual(payload);
  });

  it("persists the source event id for durable deduplication", async () => {
    dbState.workflows = [{ id: "wf-a", trigger: null }];

    await dispatchWorkflowEvent(
      "ws-1",
      "application.created",
      { application: { id: "app-1" } },
      { sourceEventId: "event-123" },
    );

    expect(dbState.runsInserted[0]?.sourceEventId).toBe("event-123");
  });
});

describe("workflow dispatcher — FASE 2.4 anti-loop", () => {
  beforeEach(() => {
    dbState.workflows = [];
    dbState.runsInserted = [];
    dbState.runningRuns = [];
    dbState.antiLoopError = null;
  });

  it("skips a workflow that has a recent running run for the same event", async () => {
    dbState.workflows = [{ id: "wf-loop", trigger: null }];
    dbState.runningRuns = [{ workflowId: "wf-loop", triggerEvent: "application.stage_changed" }];

    await dispatchWorkflowEvent("ws-1", "application.stage_changed", {
      application: { id: "app-1" },
    });

    expect(dbState.runsInserted).toHaveLength(0);
  });

  it("skips a workflow whose own run is already in progress for the same event", async () => {
    // The anti-loop query in production filters by workflowId + triggerEvent.
    // The mock returns the runningRuns set for every check, so we assert the
    // contract the dispatcher honors: a matching running run → skip.
    dbState.workflows = [{ id: "wf-loop", trigger: null }];
    dbState.runningRuns = [{ workflowId: "wf-loop", triggerEvent: "application.created" }];

    await dispatchWorkflowEvent("ws-1", "application.created", {
      application: { id: "app-1" },
    });

    expect(dbState.runsInserted).toHaveLength(0);
  });

  it("does not skip when there are no running runs", async () => {
    dbState.workflows = [{ id: "wf-a", trigger: null }];
    dbState.runningRuns = [];

    await dispatchWorkflowEvent("ws-1", "application.stage_changed", {
      application: { id: "app-1" },
    });

    expect(dbState.runsInserted).toHaveLength(1);
  });

  it("fail-closes when the anti-loop check errors (no run, returns false)", async () => {
    dbState.workflows = [{ id: "wf-a", trigger: null }];
    dbState.runningRuns = [];
    dbState.antiLoopError = new Error("database unavailable");

    const ok = await dispatchWorkflowEvent("ws-1", "application.stage_changed", {
      application: { id: "app-1" },
    });

    expect(ok).toBe(false);
    expect(dbState.runsInserted).toHaveLength(0);
  });

  it("blocks direct event dispatch in public demo before creating a run", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    dbState.workflows = [{ id: "wf-demo", trigger: null }];

    await expect(
      dispatchWorkflowEvent("ws-1", "application.created", { application: { id: "app-1" } }),
    ).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });

    expect(dbState.runsInserted).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("blocks direct scheduler reconciliation and due-run dispatch in public demo", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    await expect(reclaimStalledWorkflowRuns()).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(dispatchDueWorkflowRuns()).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    expect(findDueWorkflowRuns).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });
});
