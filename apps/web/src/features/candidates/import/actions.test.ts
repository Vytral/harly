import { beforeEach, describe, expect, it, vi } from "vitest";

// Integration-style tests for importCandidatesAction. The DB layer is mocked
// with a result queue (same pattern as pool/assign.test.ts), so we can assert
// the happy path, dedup-by-email, and the "already in pipeline" branch without
// a database. The ATS fetchers are not exercised here; they have their own
// unit tests. This covers the server-action blast radius flagged by codegraph
// (no covering tests found for importCandidatesAction).

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    transactionImpl,
    requirePermission: vi.fn(),
    insertResults: [] as unknown[][],
    emitWebhookEvent: vi.fn(),
  };
});

vi.mock("@harly/db", () => {
  // A query builder whose `then` resolves to the next queued result, mirroring
  // drizzle's awaitable builder. Both `db.select` and `tx.select` share the
  // same queue so the order in importCandidatesAction is preserved.
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    q.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve);
    q.from = () => q;
    q.where = () => q;
    q.orderBy = () => q;
    q.limit = () => q;
    return q;
  };
  return {
    db: {
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => mocks.insertResults.shift() ?? [{ id: "app-1" }],
        }),
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        mocks.transactionImpl(fn),
    },
    candidates: {},
    jobs: {},
    jobStages: {},
    applications: {},
    applicationStageHistory: {},
    activityEvents: {},
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));

import { importCandidatesAction } from "./actions";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ID = "stage-1";
const WORKSPACE_ID = "ws-1";

function row(
  overrides: Partial<{ firstName: string; lastName: string; email: string }> = {},
  rowNumber = 2,
) {
  return {
    rowNumber,
    values: {
      firstName: overrides.firstName ?? "Ada",
      lastName: overrides.lastName ?? "Lovelace",
      email: overrides.email ?? "ada@example.com",
      phone: "",
      location: "",
      linkedinUrl: "",
      githubUrl: "",
      websiteUrl: "",
      headline: "",
      summary: "",
      skills: "[]",
      educationEntries: "[]",
      experienceEntries: "[]",
    },
  };
}

describe("importCandidatesAction", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.insertResults.length = 0;
    mocks.transactionImpl.mockReset();
    mocks.emitWebhookEvent.mockReset();
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: WORKSPACE_ID },
    });

    // Query order in importCandidatesAction:
    //   1. db.select(jobs)            -> [{ id, title }]
    //   2. db.select(jobStages)       -> [{ id: STAGE_ID }]
    //   3. db.select(pipelineOrder)   -> [{ value: 0 }]
    // Per row inside the transaction:
    //   4. tx.select(candidates)      -> [] (no existing candidate)
    //   5. tx.select(dup application) -> [] (not already in pipeline)
    mocks.selectQueue.push(
      [{ id: JOB_ID, title: "Frontend Engineer" }],
      [{ id: STAGE_ID }],
      [{ value: 0 }],
    );

    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        // tx.select shares the same queue as db.select so row-level queries
        // resolve in the order the action issues them.
        select: () => {
          const q: Record<string, unknown> = {};
          q.then = (resolve: (v: unknown) => void) =>
            Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve);
          q.from = () => q;
          q.where = () => q;
          q.limit = () => q;
          return q;
        },
        insert: () => ({
          values: () => ({
            returning: async () => mocks.insertResults.shift() ?? [{ id: "cand-new" }],
          }),
        }),
      };
      return fn(tx);
    });
  });

  it("imports a new candidate and emits application.created", async () => {
    mocks.selectQueue.push(
      [], // tx.select(candidates): no existing candidate
      [], // tx.select(dup application): not in pipeline
    );

    const result = await importCandidatesAction({ jobId: JOB_ID, rows: [row()] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imported).toBe(1);
      expect(result.alreadyInPipeline).toBe(0);
      expect(result.errors).toHaveLength(0);
    }
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(1);
    // The action fires webhooks after each successful application insert.
    expect(mocks.emitWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "application.created",
      expect.objectContaining({ source: "csv_import" }),
    );
  });

  it("dedupes a candidate already in this job's pipeline (no new application)", async () => {
    mocks.selectQueue.push(
      [{ id: "cand-existing" }], // tx.select(candidates): candidate exists
      [{ id: "existing-app" }],  // tx.select(dup application): already applied
    );

    const result = await importCandidatesAction({
      jobId: JOB_ID,
      rows: [row({ email: "ada@example.com" })],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imported).toBe(0);
      expect(result.alreadyInPipeline).toBe(1);
    }
    // No new application -> no webhook for the deduped row.
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("reuses an existing candidate but creates a new application for a different job", async () => {
    mocks.selectQueue.push(
      [{ id: "cand-existing" }], // candidate exists (e.g. from another job)
      [],                         // no duplicate application for THIS job
    );

    const result = await importCandidatesAction({ jobId: JOB_ID, rows: [row()] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imported).toBe(1);
      expect(result.alreadyInPipeline).toBe(0);
    }
    expect(mocks.emitWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid email and continues with the rest of the batch", async () => {
    // First row has a bad email (rejected by Zod, no transaction query consumed).
    // Second row is valid and consumes the two tx.select calls.
    mocks.selectQueue.push(
      [], // tx.select(candidates)
      [], // tx.select(dup application)
    );

    const result = await importCandidatesAction({
      jobId: JOB_ID,
      rows: [row({ email: "not-an-email" }), row({ email: "grace@example.com" }, 3)],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ row: 2, email: "not-an-email" });
    }
    expect(mocks.emitWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the job is not found in the workspace", async () => {
    mocks.selectQueue.length = 0;
    mocks.selectQueue.push([]); // db.select(jobs): no match

    const result = await importCandidatesAction({ jobId: JOB_ID, rows: [row()] });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/job not found/i);
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the job has no pipeline stages", async () => {
    mocks.selectQueue.length = 0;
    mocks.selectQueue.push(
      [{ id: JOB_ID, title: "Frontend Engineer" }], // job exists
      [], // no stages
    );

    const result = await importCandidatesAction({ jobId: JOB_ID, rows: [row()] });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/pipeline stages/i);
  });

  it("rejects when the caller lacks candidates:edit permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));

    const result = await importCandidatesAction({ jobId: JOB_ID, rows: [row()] });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/permission/i);
  });
});
