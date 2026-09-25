import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  workflowReserved: 0,
  workspaceReserved: 0,
  max: 2,
  workspaceMax: 300,
  enabled: true,
  fail: false,
};

const tables = vi.hoisted(() => ({
  workspaceAutomationPolicies: { workspaceId: "workspaceId" },
  workspaceAutomationRunBuckets: {
    workspaceId: "workspaceId",
    bucketStart: "bucketStart",
    reserved: "reserved",
    id: "id",
  },
}));

vi.mock("@harly/db", () => ({
  db: {},
  workflowDefinitions: {},
  workflowExternalActionBuckets: {},
  workspaceAutomationPolicies: tables.workspaceAutomationPolicies,
  workspaceAutomationRunBuckets: tables.workspaceAutomationRunBuckets,
  workspaceAutomationExternalActionBuckets: {},
  workflowRunBuckets: {
    workspaceId: "workspaceId",
    workflowId: "workflowId",
    bucketStart: "bucketStart",
    reserved: "reserved",
    id: "id",
  },
  workflowRuns: {},
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    sql: actual.sql,
    lt: actual.lt,
    and: actual.and,
    eq: actual.eq,
  };
});

vi.mock("@/server/observability/metrics", () => ({
  recordAutomationGuardDecision: vi.fn(),
}));

import { reserveRunAdmissionPolicy } from "./operational-policy";

type TestTransaction = {
  insert: (table: unknown) => {
    values: () => {
      onConflictDoNothing: () => Promise<void>;
      onConflictDoUpdate: () => {
        returning: () => Promise<Array<{ id: string }>>;
      };
    };
  };
  select: () => {
    from: () => {
      where: () => {
        for: () => Promise<Array<{ enabled: boolean; maxRunsPerMinute: number }>>;
      };
    };
  };
};

type TestDatabase = TestTransaction & {
  transaction: (fn: (tx: TestTransaction) => Promise<unknown>) => Promise<unknown>;
};

function mockDb(): TestDatabase {
  const database: TestDatabase = {
    insert: (table: unknown) => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (state.fail) throw new Error("database unavailable");
            const workspace = table === tables.workspaceAutomationRunBuckets;
            const reserved = workspace
              ? state.workspaceReserved
              : state.workflowReserved;
            const max = workspace ? state.workspaceMax : state.max;
            if (reserved >= max) return [];
            if (workspace) state.workspaceReserved += 1;
            else state.workflowReserved += 1;
            return [{ id: `bucket-${reserved + 1}` }];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => [
            {
              enabled: state.enabled,
              maxRunsPerMinute: state.workspaceMax,
            },
          ],
        }),
      }),
    }),
    transaction: async (fn) => {
      const snapshot = { ...state };
      try {
        return await fn(database);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
  return database;
}

describe("reserveRunAdmissionPolicy", () => {
  beforeEach(() => {
    state.workflowReserved = 0;
    state.workspaceReserved = 0;
    state.max = 2;
    state.workspaceMax = 300;
    state.enabled = true;
    state.fail = false;
  });

  it("admits until the per-minute ceiling, then hard-defers to the next bucket", async () => {
    const database = mockDb() as never;
    const now = new Date("2026-09-22T12:00:30.000Z");
    await expect(
      reserveRunAdmissionPolicy({
        workspaceId: "ws",
        workflowId: "wf",
        maxRunsPerMinute: 2,
        circuitOpenUntil: null,
        database,
        now,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      reserveRunAdmissionPolicy({
        workspaceId: "ws",
        workflowId: "wf",
        maxRunsPerMinute: 2,
        circuitOpenUntil: null,
        database,
        now,
      }),
    ).resolves.toEqual({ ok: true });
    const limited = await reserveRunAdmissionPolicy({
      workspaceId: "ws",
      workflowId: "wf",
      maxRunsPerMinute: 2,
      circuitOpenUntil: null,
      database,
      now,
    });
    expect(limited).toMatchObject({
      ok: false,
      code: "RUN_RATE_LIMITED",
    });
    if (limited.ok) throw new Error("expected limit");
    expect(limited.deferUntil.toISOString()).toBe("2026-09-22T12:01:00.000Z");
  });

  it("applies an atomic workspace run ceiling across separate workflows", async () => {
    state.max = 10;
    state.workspaceMax = 1;
    const database = mockDb() as never;
    const now = new Date("2026-09-22T12:00:30.000Z");
    await expect(
      reserveRunAdmissionPolicy({
        workspaceId: "ws",
        workflowId: "wf-a",
        maxRunsPerMinute: 10,
        circuitOpenUntil: null,
        database,
        now,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      reserveRunAdmissionPolicy({
        workspaceId: "ws",
        workflowId: "wf-b",
        maxRunsPerMinute: 10,
        circuitOpenUntil: null,
        database,
        now,
      }),
    ).resolves.toMatchObject({ ok: false, code: "WORKSPACE_RUN_RATE_LIMITED" });
    expect(state.workflowReserved).toBe(1);
    expect(state.workspaceReserved).toBe(1);
  });

  it("defers admission while workspace automations are paused", async () => {
    state.enabled = false;
    const result = await reserveRunAdmissionPolicy({
      workspaceId: "ws",
      workflowId: "wf",
      maxRunsPerMinute: 10,
      circuitOpenUntil: null,
      database: mockDb() as never,
      now: new Date("2026-09-22T12:00:30.000Z"),
    });
    expect(result).toMatchObject({ ok: false, code: "WORKSPACE_PAUSED" });
    expect(state.workflowReserved).toBe(0);
    expect(state.workspaceReserved).toBe(0);
  });

  it("defers to circuitOpenUntil when the circuit is open", async () => {
    const until = new Date("2026-09-22T12:05:00.000Z");
    await expect(
      reserveRunAdmissionPolicy({
        workspaceId: "ws",
        workflowId: "wf",
        maxRunsPerMinute: 10,
        circuitOpenUntil: until,
        database: mockDb() as never,
        now: new Date("2026-09-22T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ ok: false, code: "CIRCUIT_OPEN", deferUntil: until });
  });
});
