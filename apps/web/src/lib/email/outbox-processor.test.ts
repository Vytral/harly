import { beforeEach, describe, expect, it, vi } from "vitest";

// The email_outbox worker is the single delivery path for transactional emails.
// It must be idempotent (never resend an offer already `sent`) and must retry
// transient failures with a growing backoff before giving up.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  const updateCalls: Array<{ set: Record<string, unknown> }> = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    insertQueue,
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

const OFFER_DRAFT = { id: "offer-1", status: "draft", title: "Engineer", applicationId: "app-1" };
const OFFER_SENT = { ...OFFER_DRAFT, status: "sent" };
const RECIPIENT = { email: "c@example.com", firstName: "C", lastName: "D", companyName: "Acme" };

function reset() {
  mocks.selectQueue.length = 0;
  mocks.insertQueue.length = 0;
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
    const tx = {
      update: () => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return { where: () => ({ returning: async () => [] }) };
        },
      }),
    };
    return fn(tx);
  });
}

describe("email_outbox worker", () => {
  beforeEach(reset);

  it("sends the email and flips the offer + outbox to sent on success", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    const sentUpdates = mocks.updateCalls.filter((c) => c.set.status === "sent");
    expect(sentUpdates.length).toBeGreaterThan(0);
  });

  it("does not resend when the offer is already sent (idempotent)", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_SENT]);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("queues a retry (keeps pending + bumps attempts) when delivery fails", async () => {
    mocks.selectQueue.push([PENDING], [OFFER_DRAFT], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(false);

    const result = await processEmailOutbox();

    expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
    // No success path; the failing row must carry a retry error + attempt bump.
    const failedUpdate = mocks.updateCalls.find((c) => c.set.lastError !== undefined);
    expect(failedUpdate?.set.lastError).toMatch(/did not accept/i);
    expect(failedUpdate?.set).toHaveProperty("attempts");
  });

  it("records the sent offer in the canonical conversation model", async () => {
    const offerWithCandidate = { ...OFFER_DRAFT, candidateId: "cand-1" };
    mocks.selectQueue.push([PENDING], [offerWithCandidate], [RECIPIENT]);
    mocks.sendWorkspaceEmail.mockResolvedValue(true);

    const result = await processEmailOutbox();

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
});
