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
} = { workflows: [], runsInserted: [], runningRuns: [] };

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
            Promise.resolve(
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
        return { returning: () => Promise.resolve([{ id: `run-${row.workflowId}` }]) };
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

// Exercise the dispatcher internals explicitly; production is disabled by the
// kill switch in `status.ts` until the creator is ready again.
vi.mock("./status", () => ({ AUTOMATIONS_ENABLED: true }));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import { dispatchWorkflowEvent } from "./dispatch";

describe("workflow dispatcher — FASE 2.3 trigger matching", () => {
  beforeEach(() => {
    dbState.workflows = [];
    dbState.runsInserted = [];
    dbState.runningRuns = [];
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
      jobId: "job-1",
    });

    expect(dbState.runsInserted).toHaveLength(1);
    expect(dbState.runsInserted[0]?.workflowId).toBe("wf-match");
  });

  it("runs a workflow with no filter on every matching event", async () => {
    dbState.workflows = [{ id: "wf-open", trigger: null }];

    await dispatchWorkflowEvent("ws-1", "interview.completed", {
      interview: { id: "iv-1" },
    });

    expect(dbState.runsInserted).toHaveLength(1);
  });

  it("ignores events that are not valid workflow triggers", async () => {
    dbState.workflows = [{ id: "wf-x", trigger: null }];

    // interview.canceled is a webhook event but NOT a workflow trigger.
    await dispatchWorkflowEvent("ws-1", "interview.canceled", { interview: { id: "iv-1" } });

    expect(dbState.runsInserted).toHaveLength(0);
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
});
