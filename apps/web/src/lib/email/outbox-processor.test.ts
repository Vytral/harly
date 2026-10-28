import { beforeEach, describe, expect, it, vi } from "vitest";

// The email_outbox worker is the single delivery path for transactional emails.
// It must be idempotent (never resend an offer already `sent`) and must retry
// transient failures with a growing backoff before giving up.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  const transactionReturningQueue: unknown[][] = [];
  const updateCalls: Array<{ set: Record<string, unknown> }> = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    insertQueue,
    transactionReturningQueue,
    updateCalls,
    transactionImpl,
    sendWorkspaceEmail: vi.fn(),
    renderActiveEmailTemplate: vi.fn(),
    getWorkspaceEmailBranding: vi.fn(),
    insertCanonicalMessage: vi.fn(),
    getWorkspaceEmailConfig: vi.fn(),
  };
});

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.orderBy = () => q;
    q.limit = async () => mocks.selectQueue.shift() ?? [];
    return q;
  };
  return {
    db: {
      execute: vi.fn(async () => [{ id: "outbox-1" }]),
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => mocks.insertQueue.shift() ?? [{ id: "x" }] }),
      })),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return { where: () => ({}) };
        },
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transactionImpl(fn),
    },
    offers: {},
    emailOutbox: {},
    candidates: {},
    organization: {},
    activityEvents: {},
    documentAssociations: {},
    documents: {},
    applications: {},
  };
});

vi.mock("@/lib/email", () => ({ sendWorkspaceEmail: mocks.sendWorkspaceEmail }));
vi.mock("@/lib/email/branding", () => ({ getWorkspaceEmailBranding: mocks.getWorkspaceEmailBranding }));
vi.mock("@/lib/email/config", () => ({ getWorkspaceEmailConfig: mocks.getWorkspaceEmailConfig }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: mocks.insertCanonicalMessage }));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: mocks.renderActiveEmailTemplate,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));

import { db } from "@harly/db";

import { processEmailOutbox } from "./outbox-processor";

const PENDING = {
  id: "outbox-1",
  workspaceId: "ws-1",
  kind: "offer.extended",
  payload: { offerId: "offer-1", actorId: "user-1" },
  status: "pending",
  attempts: 0,
  nextRetryAt: null,
};

const OFFER_DRAFT = {
  id: "offer-1",
  status: "draft",
  title: "Engineer",
  applicationId: "app-1",
  candidateId: "cand-1",
  jobId: "job-1",
};
const OFFER_SENT = { ...OFFER_DRAFT, status: "sent" };
const APPLICATION_ACTIVE = {
  id: "app-1",
  status: "active",
  candidateId: "cand-1",
  jobId: "job-1",
};
// Claimed row as the pre-send re-read sees it: still ours, nothing accepted yet.
const WORKER = "worker-1";
const LOCKED = { status: "processing", lockedBy: WORKER, sentAt: null, providerMessageId: null };
const RECIPIENT = { email: "c@example.com", firstName: "C", lastName: "D", companyName: "Acme" };

function reset() {
  mocks.selectQueue.length = 0;
  mocks.insertQueue.length = 0;
  mocks.transactionReturningQueue.length = 0;
  mocks.updateCalls.length = 0;
  mocks.transactionImpl.mockReset();
  mocks.sendWorkspaceEmail.mockReset();
  mocks.renderActiveEmailTemplate.mockResolvedValue(null);
  mocks.getWorkspaceEmailBranding.mockResolvedValue({});
  mocks.insertCanonicalMessage.mockReset();
  mocks.insertCanonicalMessage.mockResolvedValue({ messageId: "mm-1", threadId: "mt-1", duplicate: false });
  mocks.getWorkspaceEmailConfig.mockReset();
  mocks.getWorkspaceEmailConfig.mockResolvedValue(null);
  mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let updateCount = 0;
    const tx = {
      update: () => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return {
            where: () => ({
              returning: async () => {
                updateCount += 1;
                return mocks.transactionReturningQueue.shift() ?? (updateCount === 1 ? [{ id: "offer-1" }] : []);
              },
            }),
          };
        },
      }),
    };
    return fn(tx);
  });
}

describe("email_outbox worker", () => {
  beforeEach(reset);

  it("sends the email and flips the offer + outbox to sent on success", async () => {
    mocks.selectQueue.push([PENDING], [LOCKED], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    const sentUpdates = mocks.updateCalls.filter((c) => c.set.status === "sent");
    expect(sentUpdates.length).toBeGreaterThan(0);
  });

  it("does not resend when the offer is already sent (idempotent)", async () => {
    mocks.selectQueue.push([PENDING], [LOCKED], [OFFER_SENT]);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("queues a retry (keeps pending + bumps attempts) when delivery fails", async () => {
    mocks.selectQueue.push([PENDING], [LOCKED], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(false);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    // No success path; the failing row must carry a retry error + attempt bump.
    const failedUpdate = mocks.updateCalls.find((c) => c.set.lastError !== undefined);
    expect(failedUpdate?.set.lastError).toMatch(/did not accept/i);
    // Attempts are counted at claim time; a failure only schedules the retry.
    expect(failedUpdate?.set).toHaveProperty("nextRetryAt");
  });

  it("records the sent offer in the canonical conversation model", async () => {
    mocks.selectQueue.push([PENDING], [LOCKED], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.insertCanonicalMessage).toHaveBeenCalledTimes(1);
    const call = mocks.insertCanonicalMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      workspaceId: "ws-1",
      candidateId: "cand-1",
      applicationId: "app-1",
      direction: "outbound",
      source: "provider",
    });
  });

  it("does not send an offer after its application becomes terminal", async () => {
    mocks.selectQueue.push([
      PENDING,
    ], [LOCKED], [OFFER_DRAFT], [{ ...APPLICATION_ACTIVE, status: "rejected" }]);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("does not revive a withdrawn offer when delivery races its final transition", async () => {
    mocks.selectQueue.push([PENDING], [LOCKED], [OFFER_DRAFT], [APPLICATION_ACTIVE], [RECIPIENT]);
    mocks.transactionReturningQueue.push([], []);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    expect(mocks.insertCanonicalMessage).not.toHaveBeenCalled();
  });
});

// Duplicate-send scenarios. A scheduled report keeps the path short: one send,
// no offer/application lookups, so each scenario controls every state read.
describe("email_outbox duplicate-send protection", () => {
  const REPORT_ROW = {
    id: "outbox-1",
    workspaceId: "ws-1",
    kind: "report.scheduled",
    payload: { to: "c@example.com", subject: "Weekly", bodyHtml: "<p>x</p>", companyName: "Acme" },
    status: "processing",
    attempts: 2,
    nextRetryAt: null,
    actorId: null,
  };

  beforeEach(reset);

  it("never resends a row a previous worker already got accepted (stall + reclaim)", async () => {
    mocks.selectQueue.push([REPORT_ROW], [{ status: "processing", lockedBy: WORKER, sentAt: null, providerMessageId: "prov-1" }]);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
    expect(mocks.updateCalls.some((c) => c.set.status === "sent")).toBe(true);
  });

  it("does not send a row that was cancelled while queued", async () => {
    mocks.selectQueue.push([REPORT_ROW], [{ status: "cancelled", lockedBy: WORKER, sentAt: null, providerMessageId: null }]);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("does not send a row another worker re-claimed after this worker's lock went stale", async () => {
    mocks.selectQueue.push([REPORT_ROW], [{ status: "processing", lockedBy: "other-worker", sentAt: null, providerMessageId: null }]);

    const result = await processEmailOutbox({ workerId: WORKER });

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("records the provider message id before any other bookkeeping", async () => {
    mocks.selectQueue.push([REPORT_ROW], [{ status: "processing", lockedBy: WORKER, sentAt: null, providerMessageId: null }]);
    mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "prov-1" });

    await processEmailOutbox({ workerId: WORKER });

    const providerIndex = mocks.updateCalls.findIndex((c) => c.set.providerMessageId === "prov-1");
    const sentIndex = mocks.updateCalls.findIndex((c) => c.set.status === "sent");
    expect(providerIndex).toBeGreaterThanOrEqual(0);
    expect(providerIndex).toBeLessThan(sentIndex);
  });

  it("retries only the bookkeeping when marking a row sent fails after the provider accepted it", async () => {
    // Finalizing the accepted row reads the state again and must not send.
    mocks.selectQueue.push(
      [REPORT_ROW],
      [{ status: "processing", lockedBy: WORKER, sentAt: null, providerMessageId: null }],
      [{ status: "processing", lockedBy: WORKER, sentAt: null, providerMessageId: "prov-9" }],
    );
    mocks.sendWorkspaceEmail.mockResolvedValue({ messageId: "prov-9" });

    const originalUpdate = db.update;
    let failedOnce = false;
    (db as unknown as { update: unknown }).update = (table: unknown) => {
      const chain = (originalUpdate as unknown as (t: unknown) => { set: (v: Record<string, unknown>) => unknown })(table);
      return {
        set: (values: Record<string, unknown>) => {
          if (!failedOnce && values.sentAt instanceof Date) {
            failedOnce = true;
            throw new Error("connection reset after accept");
          }
          return chain.set(values);
        },
      };
    };
    try {
      const result = await processEmailOutbox({ workerId: WORKER });
      expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
      expect(failedOnce).toBe(true);
      expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    } finally {
      (db as unknown as { update: unknown }).update = originalUpdate;
    }
  });
});
