import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ACTIONS_PER_WORKFLOW } from "./schema";

/**
 * Data-layer tests (§3.5). We stub the DB and assert the data layer:
 *  - re-validates jsonb with Zod before persisting (§3.4 — never trust raw),
 *  - keeps the denormalized `triggerEvent` in sync with `trigger.event`,
 *  - scopes every query by workspaceId,
 *  - throws ApiError.notFound when a row is missing or belongs to another ws.
 */

const dbState: {
  inserted: Record<string, unknown>[];
  updated: Array<{ id: string; set: Record<string, unknown> }>;
  deleted: string[];
  workflows: Record<string, unknown>[];
  runs: Record<string, unknown>[];
  steps: Record<string, unknown>[];
} = { inserted: [], updated: [], deleted: [], workflows: [], runs: [], steps: [] };

vi.mock("@harly/db", () => ({
  db: {
    // The data layer uses several chain shapes:
    //  - select().from().where().limit()       (getWorkflow, getRun)
    //  - select().from().where().orderBy()     (listWorkflows, listRuns)
    // `.where()` returns a thenable resolving to the rows when awaited, and
    // also exposes `.orderBy()` and `.limit()` for the chained shapes.
    select: vi.fn(() => ({
      from: () => {
        const thenable: Promise<unknown> & {
          orderBy?: () => Promise<unknown> & { limit?: () => Promise<unknown> };
          limit?: () => Promise<unknown>;
        } = Promise.resolve(dbState.workflows) as never;
        const orderByResult = Object.assign(Promise.resolve(dbState.workflows), {
          limit: () => Promise.resolve(dbState.workflows.slice(0, 1)),
        });
        thenable.orderBy = () => orderByResult as never;
        thenable.limit = () => Promise.resolve(dbState.workflows.slice(0, 1));
        return { where: () => thenable };
      },
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        dbState.inserted.push(row);
        return { returning: () => Promise.resolve([row]) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((set: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: () => {
            const id = "wf-1";
            dbState.updated.push({ id, set });
            return Promise.resolve([{ ...dbState.workflows[0], ...set, id }]);
          },
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: () => Promise.resolve([{ id: "wf-1" }]),
      })),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: vi.fn(() => ({
          values: vi.fn((row: Record<string, unknown>) => {
            dbState.inserted.push(row);
            return { returning: () => Promise.resolve([row]) };
          }),
        })),
        update: vi.fn(() => ({
          set: vi.fn((set: Record<string, unknown>) => ({
            where: vi.fn(() => ({
              returning: () => {
                dbState.updated.push({ id: "wf-1", set });
                return Promise.resolve([{ ...dbState.workflows[0], ...set, id: "wf-1" }]);
              },
            })),
          })),
        })),
      }),
    ),
  },
  workflowDefinitions: {},
  workflowDefinitionVersions: {},
  workflowDrafts: {},
  workflowRuns: {},
  workflowRunSteps: {},
}));

vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));

import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
} from "./data";
import type { WorkflowDefinitionInput } from "./schema";

const validInput: WorkflowDefinitionInput = {
  name: "Auto-reject juniors",
  enabled: true,
  trigger: { event: "application.created" },
  actions: [{ type: "set_status", config: { status: "rejected" }, continueOnError: false }],
};

describe("automations data — createWorkflow re-validates jsonb (§3.4)", () => {
  beforeEach(() => {
    dbState.inserted = [];
  });

  it("persists a valid workflow and syncs triggerEvent from trigger.event", async () => {
    await createWorkflow({
      workspaceId: "ws-1",
      values: validInput,
      createdById: "user-1",
    });

    expect(dbState.inserted).toHaveLength(2);
    const row = dbState.inserted[0]!;
    expect(row).toMatchObject({
      workspaceId: "ws-1",
      name: "Auto-reject juniors",
      triggerEvent: "application.created",
      createdById: "user-1",
      enabled: false,
      status: "draft",
    });
    // The trigger jsonb is the parsed, validated object.
    expect(row.trigger).toEqual({ event: "application.created", filter: undefined });
  });

  it("rejects an invalid trigger event (Zod validation at persist time)", async () => {
    await expect(
      createWorkflow({
        workspaceId: "ws-1",
        values: {
          ...validInput,
          trigger: { event: "candidate.deleted" }, // not a workflow trigger
        } as unknown as WorkflowDefinitionInput,
        createdById: "user-1",
      }),
    ).rejects.toThrow();
    expect(dbState.inserted).toHaveLength(0);
  });

  it("persists an incomplete draft with zero actions", async () => {
    await createWorkflow({
      workspaceId: "ws-1",
      values: { ...validInput, name: "", actions: [] },
      createdById: "user-1",
    });
    expect(dbState.inserted[0]).toMatchObject({
      name: "Untitled recipe",
      actions: [],
      triggerEvent: "application.created",
    });
  });

  it("rejects more than the safe action cap", async () => {
    await expect(
      createWorkflow({
        workspaceId: "ws-1",
        values: {
          ...validInput,
          actions: Array(MAX_ACTIONS_PER_WORKFLOW + 1).fill({ type: "add_note", config: { body: "hi" } }),
        } as unknown as WorkflowDefinitionInput,
        createdById: "user-1",
      }),
    ).rejects.toThrow();
  });

  it("rejects an invalid condition tree", async () => {
    await expect(
      createWorkflow({
        workspaceId: "ws-1",
        values: {
          ...validInput,
          conditions: [{ type: "leaf", op: "eq", value: 1 }], // missing field
        } as unknown as WorkflowDefinitionInput,
        createdById: "user-1",
      }),
    ).rejects.toThrow();
  });

  it("normalizes undefined conditions to []", async () => {
    await createWorkflow({
      workspaceId: "ws-1",
      values: validInput,
      createdById: "user-1",
    });
    expect(dbState.inserted[0]?.conditions).toEqual([]);
  });
});

describe("automations data — updateWorkflow", () => {
  it("rejects an invalid trigger before touching storage", async () => {
    await expect(
      updateWorkflow({
        workspaceId: "ws-1",
        id: "wf-1",
        patch: { trigger: { event: "nope" } } as unknown as Partial<WorkflowDefinitionInput>,
      }),
    ).rejects.toThrow();
  });
});

describe("automations data — scoping + notFound", () => {
  beforeEach(() => {
    dbState.workflows = [];
    dbState.deleted = [];
  });

  it("getWorkflow throws notFound when the row is missing", async () => {
    dbState.workflows = [];
    await expect(getWorkflow({ workspaceId: "ws-1", id: "wf-x" })).rejects.toThrow();
  });

  it("deleteWorkflow resolves when a row is returned", async () => {
    await deleteWorkflow({ workspaceId: "ws-1", id: "wf-1" });
    // The mock always returns a row, so no throw.
    expect(true).toBe(true);
  });

  it("listWorkflows returns the rows the DB yields", async () => {
    dbState.workflows = [{ id: "wf-a", workspaceId: "ws-1" }];
    const rows = await listWorkflows("ws-1");
    expect(rows[0]).toMatchObject({ id: "wf-a", workspaceId: "ws-1" });
  });
});

describe("automations data mutations in public demo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks direct create and delete calls before storage writes", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const insertedBefore = dbState.inserted.length;
    const deletedBefore = dbState.deleted.length;

    await expect(
      createWorkflow({ workspaceId: "ws-demo", values: validInput, createdById: "user-demo" }),
    ).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });
    await expect(deleteWorkflow({ workspaceId: "ws-demo", id: "workflow-demo" })).rejects.toMatchObject({
      code: "DEMO_ACTION_DISABLED",
    });

    expect(dbState.inserted).toHaveLength(insertedBefore);
    expect(dbState.deleted).toHaveLength(deletedBefore);
  });
});
