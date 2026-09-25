import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end engine test (FASE 1.5). The engine's job is orchestration:
 * parse definition → evaluate conditions → iterate actions → record steps →
 * finish the run. We mock the DB + the registry handlers + the permission
 * layer so we can assert that orchestration, independent of real side effects.
 */

import { z } from "zod";

const dbState: {
  runs: Record<string, unknown>[];
  definitions: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  effects: Record<string, unknown>[];
  policies: Record<string, unknown>[];
} = { runs: [], definitions: [], steps: [], effects: [], policies: [] };

// Distinguishable table markers so db.select() can route to the right state.
// Declared with vi.hoisted so they exist when the vi.mock factory runs.
const { RUNS, DEFS, EFFECTS, POLICIES } = vi.hoisted(() => ({
  RUNS: { __table: "runs" } as unknown,
  DEFS: { __table: "definitions" } as unknown,
  EFFECTS: { __table: "effects" } as unknown,
  POLICIES: { __table: "policies" } as unknown,
}));
const policyMocks = vi.hoisted(() => ({
  reserveExternalActionPolicy: vi.fn(),
  workspaceAutomationsEnabled: vi.fn(),
  withWorkspaceAutomationEffectPermit: vi.fn(),
}));

// Stable implementations so vi.clearAllMocks() doesn't wipe them between tests.
// The engine calls db.select().from(table).where().limit() — the table marker
// arrives at from(), so select() returns a builder whose from() routes by it.
function selectImpl() {
  return {
    from: (table: { __table?: string }) => {
      // The membership lookup (actorHasPermission) resolves to a recruiter.
      if (table?.__table === "member") {
        return {
          where: () => ({
            limit: () => Promise.resolve([{ role: "recruiter" }]),
          }),
        };
      }
      const source =
        table?.__table === "runs"
          ? dbState.runs
          : table?.__table === "definitions"
            ? dbState.definitions
            : table?.__table === "effects"
              ? dbState.effects
            : [];
      return {
        where: () => ({
          limit: () => Promise.resolve(source.length ? [source[0]!] : []),
        }),
      };
    },
  };
}

function transactionSelectImpl(selection?: Record<string, unknown>) {
  return {
    from: (table: { __table?: string }) => {
      const source =
        table?.__table === "runs"
          ? dbState.runs
          : table?.__table === "definitions"
            ? dbState.definitions
            : table?.__table === "policies"
              ? dbState.policies
              : [];
      const rows =
        table?.__table === "runs" && selection && "count" in selection
          ? [
              {
                count: dbState.runs.filter(
                  (run) =>
                    (run.engineVersion === 1 &&
                      run.status === "running" &&
                      Boolean(run.lockedBy) &&
                      run.lockedAt instanceof Date &&
                      run.lockedAt.getTime() > Date.now() - 5 * 60_000) ||
                    (run.engineVersion === 2 &&
                      run.logicalStatus === "running" &&
                      Boolean(run.lockedBy) &&
                      run.leaseUntil instanceof Date &&
                      run.leaseUntil.getTime() > Date.now()),
                ).length,
              },
            ]
          : source;
      const query = {
        where: () => query,
        for: () => Promise.resolve(rows),
        limit: (limit?: number) =>
          Promise.resolve(limit === undefined ? rows : rows.slice(0, limit)),
        then: (
          resolve: (value: Record<string, unknown>[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(rows).then(resolve, reject),
      };
      return query;
    },
  };
}

function transactionUpdateImpl(table: { __table?: string }) {
  return {
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: () => {
          const run = dbState.runs[0];
          if (table?.__table !== "runs" || !run) return Promise.resolve([]);
          if (!("lockedBy" in values)) {
            dbState.runs[0] = {
              ...run,
              nextAttemptAt: new Date(Date.now() + 60_000),
            };
            return Promise.resolve([]);
          }
          const due =
            !(run.nextAttemptAt instanceof Date) ||
            run.nextAttemptAt.getTime() <= Date.now();
          const leaseExpired =
            !(run.lockedAt instanceof Date) ||
            run.lockedAt.getTime() < Date.now() - 5 * 60_000;
          if (
            run.engineVersion !== 1 ||
            run.status !== "running" ||
            !due ||
            !leaseExpired
          ) {
            return Promise.resolve([]);
          }
          dbState.runs[0] = {
            ...run,
            ...values,
            attemptCount: Number(run.attemptCount ?? 0) + 1,
          };
          return Promise.resolve([{ id: run.id }]);
        },
      }),
    }),
  };
}

function transactionInsertImpl(table: { __table?: string }) {
  return {
    values: (rows: Record<string, unknown>) => ({
      onConflictDoNothing: () => {
        if (
          table?.__table === "policies" &&
          !dbState.policies.some(
            (policy) => policy.workspaceId === rows.workspaceId,
          )
        ) {
          dbState.policies.push({
            enabled: true,
            maxConcurrentRuns: 20,
            ...rows,
          });
        }
        return Promise.resolve();
      },
    }),
  };
}

function transactionImpl<T>(callback: (tx: unknown) => Promise<T>) {
  const tx = {
    select: vi.fn(transactionSelectImpl),
    insert: vi.fn(transactionInsertImpl),
    update: vi.fn(transactionUpdateImpl),
  };
  return callback(tx);
}
function insertImpl(rows: Record<string, unknown> | Record<string, unknown>[]) {
  const arr = Array.isArray(rows) ? rows : [rows];
  dbState.steps.push(...arr);
  return {
    returning: () => Promise.resolve([{ id: "step-1" }]),
    onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: "step-1" }]) }),
    onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ id: "step-1" }]) }),
  };
}

vi.mock("@harly/db", () => ({
  db: {
    transaction: vi.fn(transactionImpl),
    select: vi.fn(selectImpl),
    update: vi.fn((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: () => Promise.resolve(
            table === RUNS && dbState.runs[0]?.engineVersion === 2
              ? []
              : [{ id: "run-1", status: "updated" }],
          ),
        })),
      })),
    })),
    insert: vi.fn((table: { __table?: string }) => ({
      values: vi.fn((rows: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table?.__table === "effects") {
          const values = Array.isArray(rows) ? rows : [rows];
          dbState.effects.push(...values);
          return { onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: "effect-1" }]) }) };
        }
        return insertImpl(rows);
      }),
    })),
  },
  workflowRuns: RUNS,
  workflowDefinitions: DEFS,
  workflowRunSteps: {},
  workflowActionEffects: EFFECTS,
  workspaceAutomationPolicies: POLICIES,
  member: { __table: "member" },
}));

// Stub the condition loader — the evaluator itself is exercised in
// conditions.test.ts. Here we control what the engine sees.
vi.mock("./conditions", async () => {
  const actual = await vi.importActual<typeof import("./conditions")>("./conditions");
  return { ...actual, loadConditionContext: vi.fn() };
});

// Stub the registry so the engine's action loop is deterministic and does not
// touch real tables. Each action type resolves to a tiny fake handler.
function getActionHandlerImpl(type: string) {
  if (type === "bogus") return undefined;
  return {
    schema: z.object({
      status: z.string().optional(),
      fail: z.boolean().optional(),
      body: z.string().optional(),
      label: z.string().optional(),
    }),
    requiresPermission: "candidates:edit",
    label: `fake-${type}`,
    summarize: () => `fake-${type}`,
    run: vi.fn(async (input: unknown) => ({
      success: (input as { fail?: boolean })?.fail !== true,
      data: { type, input },
    })),
  };
}
vi.mock("./registry", () => ({
  getActionHandler: vi.fn(getActionHandlerImpl),
}));
vi.mock("./runtime/operational-policy", () => ({
  reserveExternalActionPolicy: policyMocks.reserveExternalActionPolicy,
  workspaceAutomationsEnabled: policyMocks.workspaceAutomationsEnabled,
  withWorkspaceAutomationEffectPermit:
    policyMocks.withWorkspaceAutomationEffectPermit,
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  getRolePermissions: vi.fn().mockResolvedValue(["candidates:edit", "candidates:move"]),
}));
vi.mock("@/features/workspaces/permissions", () => ({
  roleIsAllPowerful: vi.fn((role: string) => role === "owner"),
}));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));

import { runWorkflow } from "./engine";
import { loadConditionContext } from "./conditions";
import { getActionHandler } from "./registry";
import { getRolePermissions } from "@/features/workspaces/permissions-server";
import { db } from "@harly/db";

const baseRun = {
  id: "run-1",
  workspaceId: "ws-1",
  workflowId: "wf-1",
  triggerEvent: "application.created",
  triggerPayload: { application: { id: "app-1" }, candidateId: "cand-1", jobId: "job-1" },
  engineVersion: 1,
  status: "running",
  startedAt: new Date(),
};

const baseDefinition = {
  id: "wf-1",
  workspaceId: "ws-1",
  name: "Auto-reject juniors",
  enabled: true,
  triggerEvent: "application.created",
  trigger: { event: "application.created" },
  createdById: "user-1",
};

function setDefinition(overrides: Record<string, unknown> = {}) {
  dbState.definitions = [{ ...baseDefinition, ...overrides }];
}

function ctxWith(candidate: Record<string, unknown> | null) {
  return {
    workspaceId: "ws-1",
    candidate,
    application: candidate ? { id: "app-1", workspaceId: "ws-1" } : null,
    job: null,
    ai: null,
    trigger: { application: { id: "app-1" } },
  };
}

describe("workflow engine — end-to-end", () => {
  beforeEach(() => {
    dbState.runs = [{ ...baseRun }];
    dbState.definitions = [{ ...baseDefinition }];
    dbState.steps = [];
    dbState.effects = [];
    dbState.policies = [
      { workspaceId: "ws-1", enabled: true, maxConcurrentRuns: 20 },
    ];
    // clearAllMocks wipes implementations; re-install the stable ones so the
    // engine can read runs/definitions, record steps, and resolve handlers.
    vi.clearAllMocks();
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectImpl);
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation((table: { __table?: string }) => ({
      values: vi.fn((rows: Record<string, unknown> | Record<string, unknown>[]) =>
        table?.__table === "effects"
          ? { onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: "effect-1" }]) }) }
          : insertImpl(rows),
      ),
    }));
    (getActionHandler as ReturnType<typeof vi.fn>).mockImplementation(getActionHandlerImpl);
    policyMocks.reserveExternalActionPolicy.mockResolvedValue({ ok: true });
    policyMocks.workspaceAutomationsEnabled.mockResolvedValue(true);
    policyMocks.withWorkspaceAutomationEffectPermit.mockImplementation(
      async ({ effect }: { effect: () => Promise<unknown> }) => ({
        started: true,
        value: await effect(),
      }),
    );
    (getRolePermissions as ReturnType<typeof vi.fn>).mockResolvedValue([
      "candidates:edit",
      "candidates:move",
    ]);
  });

  it("skips the run when conditions do not match (records no steps)", async () => {
    setDefinition({
      conditions: [
        { type: "leaf", field: { kind: "candidate", path: "experienceYears" }, op: "lt", value: 2 },
      ],
      actions: [{ type: "set_status", config: { status: "rejected" } }],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 5 }));

    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("skipped");
    expect(dbState.steps).toHaveLength(0);
  });

  it("runs actions and succeeds when conditions match", async () => {
    setDefinition({
      conditions: [
        { type: "leaf", field: { kind: "candidate", path: "experienceYears" }, op: "lt", value: 2 },
      ],
      actions: [{ type: "set_status", config: { status: "rejected" } }],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));

    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("succeeded");
    expect(dbState.steps).toHaveLength(1);
    expect(dbState.steps[0]).toMatchObject({ actionType: "set_status", status: "succeeded" });
  });

  it("runs multiple actions in order", async () => {
    setDefinition({
      conditions: [],
      actions: [
        { type: "set_status", config: { status: "rejected" } },
        { type: "add_note", config: { body: "auto" } },
        { type: "add_tag", config: { label: "auto-rejected" } },
      ],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));

    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("succeeded");
    expect(dbState.steps).toHaveLength(3);
    expect(dbState.steps.map((s) => s.actionType)).toEqual([
      "set_status",
      "add_note",
      "add_tag",
    ]);
  });

  it("does not run a legacy external action when the atomic policy reservation is denied", async () => {
    dbState.runs = [{ ...baseRun, attemptCount: 0, maxAttempts: 3 }];
    const handler = getActionHandlerImpl("http_request");
    vi.mocked(getActionHandler).mockReturnValue(handler as never);
    policyMocks.reserveExternalActionPolicy.mockResolvedValue({
      ok: false,
      code: "EXTERNAL_RATE_LIMITED",
    });
    setDefinition({
      conditions: [],
      maxExternalActionsPerMinute: 1,
      actions: [{ type: "http_request", config: { body: "request" } }],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));

    const outcome = await runWorkflow("run-1");

    expect(policyMocks.reserveExternalActionPolicy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workflowId: "wf-1",
      runId: "run-1",
      database: undefined,
    });
    expect(handler?.run).not.toHaveBeenCalled();
    expect(dbState.steps[0]).toMatchObject({
      actionType: "http_request",
      status: "failed",
      errorCode: "external_rate_limited",
      retryable: true,
    });
    expect(outcome.status).toBe("running");
  });

  it("fails the run when an action fails and continueOnError is false", async () => {
    setDefinition({
      conditions: [],
      actions: [
        { type: "set_status", config: { fail: true }, continueOnError: false },
        { type: "add_note", config: { body: "never" } },
      ],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));

    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("failed");
    // The second action must NOT have run.
    expect(dbState.steps.map((s) => s.actionType)).toEqual(["set_status"]);
  });

  it("continues past a failed action when continueOnError is true", async () => {
    setDefinition({
      conditions: [],
      actions: [
        { type: "set_status", config: { fail: true }, continueOnError: true },
        { type: "add_note", config: { body: "still runs" } },
      ],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));

    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("succeeded");
    expect(dbState.steps.map((s) => s.actionType)).toEqual(["set_status", "add_note"]);
  });

  it("fails the run when the definition was deleted", async () => {
    dbState.definitions = [];
    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("failed");
  });

  it("fails when the workflow has no creator", async () => {
    setDefinition({ createdById: null, conditions: [] });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith(null));
    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("failed");
  });

  it("records a failed step when the action type is unknown", async () => {
    setDefinition({
      conditions: [],
      actions: [{ type: "bogus", config: {} }],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));
    const outcome = await runWorkflow("run-1");
    expect(outcome.status).toBe("failed");
    expect(dbState.steps[0]).toMatchObject({ actionType: "bogus", status: "failed" });
  });

  it("dry-run succeeds and records no action steps", async () => {
    setDefinition({
      conditions: [],
      actions: [{ type: "set_status", config: { status: "rejected" } }],
    });
    vi.mocked(loadConditionContext).mockResolvedValue(ctxWith({ experienceYears: 1 }));
    const outcome = await runWorkflow("run-1", { dryRun: true });
    expect(outcome.status).toBe("succeeded");
    expect(dbState.steps).toHaveLength(0);
  });

  it("does not claim a run row that does not exist", async () => {
    dbState.runs = [];
    await expect(runWorkflow("nonexistent")).rejects.toThrow(
      "already leased or not due",
    );
  });

  it("never lets the historical runner claim a v2 graph run", async () => {
    dbState.runs = [{ ...baseRun, engineVersion: 2 }];
    setDefinition({ actions: [{ type: "set_status", config: { status: "rejected" } }] });

    await expect(runWorkflow("run-1")).rejects.toThrow("already leased or not due");
    expect(dbState.steps).toHaveLength(0);
  });
});
