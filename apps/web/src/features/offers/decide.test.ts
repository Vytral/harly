import { beforeEach, describe, expect, it, vi } from "vitest";

// decideOffer: sent → accepted | declined. Accepting also moves the
// application to the job's Hired stage. These tests pin two guards:
//  - accepting an offer whose application is no longer `active` is refused
//    (so we never silently revive a rejected/withdrawn candidacy).
//  - the offer.accepted/declined activity event is written inside the same
//    transaction as the offer mutation (atomic audit log).

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  // Activity events inserted *inside* the transaction callback.
  const txInserts: Array<{ values: Record<string, unknown> }> = [];
  const txUpdates: Array<{ set: Record<string, unknown> }> = [];
  // What the offer UPDATE ... RETURNING yields inside the tx. Exposed as a
  // property (not just a setter) so the vi.mock factory can read it.
  const txState: { offerReturning: unknown[] } = { offerReturning: [{ id: "offer-1" }] };
  return {
    selectQueue,
    insertQueue,
    txInserts,
    txUpdates,
    txState,
    setTxOfferReturning: (rows: unknown[]) => {
      txState.offerReturning = rows;
    },
    requirePermission: vi.fn(),
    emitWebhookEvent: vi.fn(),
    enqueueEmailOutbox: vi.fn(),
    processEmailOutbox: vi.fn(),
    transactionImpl: vi.fn(),
  };
});

// drizzle-orm helpers are used in query builders (and/eq/or) with table columns
// that are empty objects in the @harly/db mock. Stub them to sentinels so the
// real drizzle never receives undefined column refs.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  or: (...args: unknown[]) => ({ __or: args }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  desc: (a: unknown) => ({ __desc: a }),
  lt: (a: unknown, b: unknown) => ({ __lt: [a, b] }),
  isNull: (a: unknown) => ({ __isNull: a }),
  exists: (value: unknown) => ({ __exists: value }),
  getTableColumns: (table: object) => table,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: [strings, values],
  }),
}));

vi.mock("@harly/db", () => {
  // Query builder used outside the tx (db.select) and inside (tx.select) —
  // both drain the same selectQueue so test setup is linear. The builder is
  // also thenable: `await db.select().from().where()` (no .limit, as in
  // notifyHiringTeam) resolves to the next queued rows, matching Drizzle's
  // execute-on-await semantics for terminal queries.
  const makeQuery = () => {
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve),
    };
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.orderBy = () => q;
    q.for = () => q;
    q.limit = async () => mocks.selectQueue.shift() ?? [];
    return q;
  };
  // tx.update → { set → { where → { returning } } }; tx.insert → { values → {} }
  const makeTx = () => ({
    select: vi.fn(makeQuery),
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => {
        mocks.txUpdates.push({ set });
        return {
          where: () => ({
            returning: async () => mocks.txState.offerReturning,
          }),
        };
      },
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        mocks.txInserts.push({ values });
        return { returning: async () => [{ id: "x" }] };
      },
    })),
  });
  return {
    db: {
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => mocks.insertQueue.shift() ?? [{ id: "x" }] }),
      })),
      update: vi.fn(() => ({
        set: () => ({ where: () => ({}) }),
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        mocks.transactionImpl(fn),
    },
    // Expose makeTx via a side channel the test uses to build the tx object.
    __makeTx: makeTx,
    offers: {},
    emailOutbox: {},
    activityEvents: {},
    candidates: {},
    jobs: {},
    organization: {},
    applications: {},
    jobStages: {},
    applicationStageHistory: {},
    jobHiringTeam: {},
    notifications: {},
    workspaceSettings: {},
    documents: {},
    documentAssociations: {},
    signatureFields: {},
    signatureEnvelopes: {},
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireOfferPermission: mocks.requirePermission,
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
  processEmailOutbox: mocks.processEmailOutbox,
}));
vi.mock("@/lib/email", () => ({
  sendWorkspaceEmail: vi.fn(),
  getWorkspaceEmailBranding: vi.fn(),
}));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: vi.fn(),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { decideOffer } from "./actions";
import * as dbModule from "@harly/db";

// The vi.mock factory below exposes a `__makeTx` side channel (not part of the
// real @harly/db types) so tests can build a fake `tx` for the transaction
// callback. Cast through `unknown` to bypass the real module's types.
const __makeTx = (dbModule as unknown as { __makeTx: () => unknown }).__makeTx;

const OFFER = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "sent",
  candidateId: "candidate-1",
  applicationId: "app-1",
  jobId: "job-1",
  title: "Engineer",
  salaryAmount: null,
  currency: null,
  salaryPeriod: null,
  equity: null,
  startDate: null,
  expiresAt: null,
};

describe("decideOffer guards", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.insertQueue.length = 0;
    mocks.txInserts.length = 0;
    mocks.txUpdates.length = 0;
    mocks.setTxOfferReturning([{ id: "offer-1" }]);
    mocks.transactionImpl.mockReset();
    mocks.emitWebhookEvent.mockReset();
    mocks.requirePermission.mockReset();
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1", name: "Recruiter" },
      organization: { id: "ws-1" },
    });
  });

  it("accepts an active application: marks offer accepted, hires, and logs inside the tx", async () => {
    // Select order: [offer] (pre-tx), [application active] (pre-tx guard),
    // then inside tx: [application] (re-select for stage), [hiredStage].
    // Post-tx: [recipient], [hiringTeam].
    mocks.selectQueue.push([OFFER]);
    mocks.selectQueue.push([
      { id: "app-1", status: "active", currentStageId: "stage-old" },
    ]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = __makeTx();
      mocks.selectQueue.push([
        { id: "app-1", status: "active", currentStageId: "stage-old" },
      ]);
      mocks.selectQueue.push([{ id: "stage-hired" }]);
      await fn(tx);
      mocks.selectQueue.push([null]); // getOfferRecipient
      mocks.selectQueue.push([]); // jobHiringTeam (none)
    });

    const result = await decideOffer({
      offerId: OFFER.id,
      decision: "accepted",
    });

    expect(result.success).toBe(true);
    // Application was moved to hired.
    const appUpdate = mocks.txUpdates.find(
      (u) => u.set.status === "hired",
    );
    expect(appUpdate).toBeDefined();
    // Activity log written inside the tx (offer.accepted).
    const acceptedLog = mocks.txInserts.find(
      (i) => i.values.type === "offer.accepted",
    );
    expect(acceptedLog).toBeDefined();
    // application.hired activity also logged inside the tx.
    const hiredLog = mocks.txInserts.find(
      (i) => i.values.type === "application.hired",
    );
    expect(hiredLog).toBeDefined();
    // Webhook fired post-commit for the hire.
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(
      "ws-1",
      "application.hired",
      expect.objectContaining({ application: { id: "app-1", jobId: "job-1" } }),
      { actorId: "user-1", skipDomainEvent: true },
    );
  });

  it("refuses to accept an offer whose application was already rejected", async () => {
    // Select order: [offer], [application rejected] (pre-tx guard trips here).
    // The transaction never runs.
    mocks.selectQueue.push([OFFER]);
    mocks.selectQueue.push([
      { id: "app-1", status: "rejected", currentStageId: "stage-old" },
    ]);
    mocks.transactionImpl.mockImplementation(async () => {
      throw new Error("tx should not run when the pre-tx guard refuses");
    });

    const result = await decideOffer({
      offerId: OFFER.id,
      decision: "accepted",
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/no longer active/i);
    // No hire mutation, no application.hired event, no webhook.
    expect(mocks.txUpdates.find((u) => u.set.status === "hired")).toBeUndefined();
    expect(mocks.txInserts.find((i) => i.values.type === "application.hired")).toBeUndefined();
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("declines without touching the application status (no hire)", async () => {
    // Select order: [offer] (pre-tx). Decline skips the pre-tx application
    // guard. Inside tx: no application/hiredStage selects (no accepted branch).
    // Post-tx: [recipient], [hiringTeam].
    mocks.selectQueue.push([OFFER]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = __makeTx();
      await fn(tx);
      mocks.selectQueue.push([null]); // getOfferRecipient
      mocks.selectQueue.push([]); // jobHiringTeam (none)
    });

    const result = await decideOffer({
      offerId: OFFER.id,
      decision: "declined",
    });

    expect(result.success).toBe(true);
    // No application status mutation on decline.
    expect(mocks.txUpdates.find((u) => u.set.status === "hired")).toBeUndefined();
    // offer.declined logged inside the tx.
    const declinedLog = mocks.txInserts.find(
      (i) => i.values.type === "offer.declined",
    );
    expect(declinedLog).toBeDefined();
    // No hire webhook on decline.
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });
});
